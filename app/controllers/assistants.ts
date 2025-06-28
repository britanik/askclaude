import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"
import Thread from '../models/threads'
import Message from '../models/messages'
import { IThread } from "../interfaces/threads"
import { IUser } from "../interfaces/users"
import { IMessage } from "../interfaces/messages"
import { sendMessage } from "../templates/sendMessage"
import { analyzeConversation, claudeCall, formatMessagesWithImages, IConversationAnalysisResult, saveImagePermanently } from "../services/ai"
import { isTokenLimit, logTokenUsage, logWebSearchUsage } from "./tokens"
import { saveAIResponse } from "../helpers/fileLogger"
import { withChatAction } from "../helpers/chatAction"
import { isAdmin } from "../helpers/helpers"
import { searchNotionPages } from "./notion"

export interface IAssistantParams {
  user: IUser
  firstMessage?: string
  webSearch?: boolean
  notion?: boolean
}

export async function startAssistant(params:IAssistantParams): Promise<IThread> {
  const { user, firstMessage, webSearch = false, notion = false } = params
  try {
    // Create a new thread
    const thread: IThread = await new Thread({ 
      owner: user, 
      webSearch, 
      notion // Add this line
    }).save()
    
    // Create and add the first message
    await new Message({
      thread: thread._id,
      role: 'user',
      content: firstMessage
    }).save()
    
    return thread
  } catch(e) {
    console.log('Failed to startAssistant', e)
  }
}

export async function createNewThread(params): Promise<IThread> {
  try {
    const { user, messages } = params
    // Create a new thread
    const thread: IThread = await new Thread({ owner: user }).save()
    
    // Add initial messages if provided
    if (messages && messages.length > 0) {
      for (const msgData of messages) {
        await new Message({
          thread: thread._id,
          ...msgData
        }).save()
      }
    }
    
    return thread
  } catch(e) {
    console.log('Failed to createNewThread', e)
  }
}

export async function handleUserReply( 
  user: IUser, 
  userReply: string, 
  bot: TelegramBot, 
  images: string[] = [], 
  mediaGroupId?: string 
): Promise<{ thread: IThread, isNew: boolean }> {
  // Get the most recent thread
  let thread: IThread = await getRecentThread(user);
  const savedImagePaths = [];
  
  // Process images if any
  if (images.length > 0) {
    for (const imageId of images) {
      try {
        const fileLink = await bot.getFileLink(imageId);
        const savedPath = await saveImagePermanently(fileLink, imageId);
        savedImagePaths.push({
          telegramId: imageId,
          localPath: savedPath
        });
        console.log(`[PHOTO DETAILS] File ID: ${imageId}, Saved to: ${savedPath}`);
      } catch (error) {
        console.error(`Error saving image ${imageId}:`, error);
      }
    }
  }

  // If this is part of a media group
  if (mediaGroupId) {
    // Handle media group messages as before
    const lastMediaMessage = await Message.findOne({ 
      thread: thread._id, 
      mediaGroupId: mediaGroupId,
      role: 'user'
    }).sort({ created: -1 });
    
    if (lastMediaMessage) {
      lastMediaMessage.images = lastMediaMessage.images || [];
      lastMediaMessage.images.push(...images);
      
      if (userReply && userReply.trim() !== " " && userReply.trim() !== "") {
        lastMediaMessage.content = userReply;
      }
      
      await lastMediaMessage.save();
      return { thread, isNew: false };
    } else {
      await new Message({
        thread: thread._id,
        role: 'user',
        content: userReply || " ",
        images: images.length > 0 ? images : undefined,
        mediaGroupId
      }).save();
      
      return { thread, isNew: false };
    }
  } else {
    // This is a regular message (not part of a media group)
    
    // Check if conversation analysis is enabled in .env (default to disabled if not set)
    const isAnalysisEnabled = parseInt(process.env.ENABLE_CONVERSATION_ANALYSIS || '0') === 1;
    
    // Skip all analysis logic if the feature is disabled
    let shouldCreateNewThread = false;

    // Web search and Notion disabled by default
    let webSearch = false;
    let notion = false;
    
    // Only query for messages and perform analysis if the feature is enabled
    if (isAnalysisEnabled && images.length === 0) {
      // Get the last few messages from the thread for analysis
      const lastMessages = await Message.find({ thread: thread._id })
        .sort({ created: -1 })
        .limit(5);
      
      // Only analyze if there's at least one previous message
      if (lastMessages.length > 0) {
        // Format messages for the analysis
        const formattedMessages = lastMessages
          .reverse()
          .map(msg => ({
            role: msg.role,
            content: msg.content || ""
          }));
          
        // Analyze the conversation
        const analysis:IConversationAnalysisResult = await analyzeConversation(formattedMessages, userReply);
        webSearch = analysis.search || false;
        console.log(`[CONVERSATION ANALYSIS] ${user.username || user.chatId}: ${analysis.action} - ${analysis.search}`);
        
        // If analysis says it's a new topic, create a new thread
        if (analysis.action === 'new') {
          shouldCreateNewThread = true;
        }
      }
    }
    
    // Create a new thread if analysis determined it's a new topic
    let startAssistantParams:IAssistantParams = {
      user,
      firstMessage: userReply,
      webSearch,
      notion,
    }

    if (shouldCreateNewThread) {
      thread = await startAssistant(startAssistantParams);
      console.log(`[NEW THREAD CREATED] For ${user.username || user.chatId} based on topic change analysis`);
      return { thread, isNew: true };
    }
    
    // Otherwise continue with the existing thread
    await new Message({
      thread: thread._id,
      role: 'user',
      content: userReply || " ",
      images: images.length > 0 ? images : undefined
    }).save();
    
    return { thread, isNew: false };
  }
}

export async function handleAssistantReply(
  thread: IThread, 
  isNewThread: boolean, 
  bot: TelegramBot, 
  dict: Dict
): Promise<void> {
  try {
    // Use the chat action helper for typing action while processing
    const assistantReply = await withChatAction(
      bot,
      thread.owner.chatId,
      'typing',
      () => sendThreadToChatGPT({ thread, bot })
    );

    // Save the response to file
    await saveAIResponse(assistantReply, 'response');

    // Add the assistant's message to thread
    await new Message({
      thread: thread._id,
      role: 'assistant',
      content: assistantReply
    }).save();

    if (assistantReply) {
      await sendThreadToUser({ 
        user: thread.owner, 
        content: (isNewThread && isAdmin(thread.owner)) ? assistantReply + '\n\n🆕' : assistantReply,
        bot, 
        dict 
      });
    }

  } catch (error) {
    console.error('Error in handleAssistantReply:', error);
    // Send error message to user
    await sendMessage({ 
      text: dict.getString('ASSISTANT_ERROR'), 
      user: thread.owner, 
      bot 
    });
  }
}

export async function getRecentThread(user: IUser): Promise<IThread> {
  try {
    let recentThread = await Thread.findOne({ owner: user }).sort({ created: -1 }).populate('owner')
    if (!recentThread) {
      // If no thread is found, create a new one
      recentThread = await createNewThread({ user, messages: [] })
    }
    return recentThread
  } catch(e) {
    console.log('Failed to getRecentThread', e)
  }
}

export async function sendThreadToChatGPT(params) {
  const { thread, bot } = params
  try {
    // Get fresh thread and owner to ensure we have the latest
    const freshThread = await Thread.findById(thread._id).populate('owner')
    const user = freshThread.owner
    
    // Get all messages for this thread
    const messages = await Message.find({ thread: thread._id }).sort({ created: 1 })
    
    // Format messages for Claude API with image support
    const formattedMessages = await formatMessagesWithImages(messages, user, bot)
    
    try {
      const chatCompletion = await claudeCall({
        messages: formattedMessages, 
        temperature: 1,
        user, // Pass user for web search limit checking
        webSearch: thread.webSearch, // Pass web search flag from thread
        notion: thread.notion, // Pass notion flag from thread
        bot
      })
      
      // Log tokens usage
      if (chatCompletion.usage) {
        const inputTokens = chatCompletion.usage.input_tokens || 0
        const outputTokens = chatCompletion.usage.output_tokens || 0
        await logTokenUsage(
          user, 
          thread, 
          inputTokens, 
          outputTokens,
          chatCompletion.model || process.env.CLAUDE_MODEL,
          bot
        )
        
        // Log web search usage if any
        if (chatCompletion.usage.server_tool_use?.web_search_requests) {
          await logWebSearchUsage(
            user,
            thread,
            chatCompletion.usage.server_tool_use.web_search_requests,
            chatCompletion.model || process.env.CLAUDE_MODEL,
            bot
          );
        }
      }
      
      // Extract search results and format response
      let responseText = '';
      let searchResults = [];
      let notionResults = [];
      
      if (chatCompletion.content && Array.isArray(chatCompletion.content)) {
        for (const contentItem of chatCompletion.content) {
          if (contentItem.type === 'text') {
            responseText += contentItem.text;
          } else if (contentItem.type === 'web_search_tool_result') {
            // Collect search results
            if (contentItem.content) {
              for (const result of contentItem.content) {
                if (result.type === 'web_search_result') {
                  searchResults.push({
                    title: result.title,
                    url: result.url
                  });
                }
              }
            }
          }
        }
      } else {
        // Fallback for simple text response
        responseText = chatCompletion.content[0].text;
      }
      
      // Format final response with search results and notion results at the top
      let finalResponse = '';
      
      // Add web search results if any
      if (searchResults.length > 0) {
        finalResponse += '<b>🔍 Источники:</b>\n';
        searchResults.slice(0, 3).forEach((result, index) => {
          finalResponse += `${index + 1}. <a href="${result.url}">${result.title}</a>\n`;
        });
        finalResponse += '\n';
      }
      
      // Add notion results if any
      if (notionResults.length > 0) {
        finalResponse += '<b>📄 Из ваших Notion страниц:</b>\n';
        notionResults.slice(0, 3).forEach((result, index) => {
          finalResponse += `${index + 1}. <a href="${result.url}">${result.title}</a>\n`;
        });
        finalResponse += '\n';
      }
      
      finalResponse += responseText;
      
      return finalResponse;
    } catch (error) {
      console.error('Claude API call failed:', error)
      throw error
    }
  } catch(e) {
    console.log('Failed to send message to Anthropic API or other error:', e)
    throw e
  }
}

export async function sendThreadToUser(params: { user: IUser, content?: string, bot: TelegramBot, dict: Dict }) {
  const { user, content, bot, dict } = params
  try {
    await sendMessage({ text: content, user, bot })
  } catch(e) {
    console.log('Failed to sendThreadToUser', e)
  }
}

export async function getThreadMessages(threadId: string): Promise<IMessage[]> {
  return await Message.find({ thread: threadId }).sort({ created: 1 })
}