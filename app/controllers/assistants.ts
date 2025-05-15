import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"
import Thread from '../models/threads'
import Message from '../models/messages'
import { IThread } from "../interfaces/threads"
import { IUser } from "../interfaces/users"
import { IMessage } from "../interfaces/messages"
import { sendMessage } from "../templates/sendMessage"
import { analyzeConversation, claudeCall, formatMessagesWithImages, saveImagePermanently } from "../services/ai"
import { isTokenLimit, logTokenUsage } from "./tokens"

export async function startAssistant(user: IUser, firstMessage: string): Promise<IThread> {
  try {
    // Create a new thread
    const thread: IThread = await new Thread({ owner: user }).save()
    
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

export async function handleUserReply( user: IUser, userReply: string, bot: TelegramBot, images: string[] = [], mediaGroupId?: string ): Promise<IThread> {
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
      return thread;
    } else {
      await new Message({
        thread: thread._id,
        role: 'user',
        content: userReply || " ",
        images: images.length > 0 ? images : undefined,
        mediaGroupId
      }).save();
      
      return thread;
    }
  } else {
    // This is a regular message (not part of a media group)
    
    // Check if conversation analysis is enabled in .env (default to disabled if not set)
    const isAnalysisEnabled = parseInt(process.env.ENABLE_CONVERSATION_ANALYSIS || '0') === 1;
    
    // Skip all analysis logic if the feature is disabled
    let shouldCreateNewThread = false;
    
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
        const analysis = await analyzeConversation(formattedMessages, userReply);
        console.log(`[CONVERSATION ANALYSIS] ${user.username || user.chatId}: ${analysis.action} - ${analysis.reasoning}`);
        
        // If analysis says it's a new topic, create a new thread
        if (analysis.action === 'new') {
          shouldCreateNewThread = true;
        }
      }
    }
    
    // Create a new thread if analysis determined it's a new topic
    if (shouldCreateNewThread) {
      thread = await startAssistant(user, userReply);
      console.log(`[NEW THREAD CREATED] For ${user.username || user.chatId} based on topic change analysis`);
      return thread;
    }
    
    // Otherwise continue with the existing thread
    await new Message({
      thread: thread._id,
      role: 'user',
      content: userReply || " ",
      images: images.length > 0 ? images : undefined
    }).save();
    
    return thread;
  }
}

export async function handleAssistantReply(thread: IThread, bot: TelegramBot, dict: Dict): Promise<void> {
  // Get fresh thread before processing
  const freshThread = await Thread.findById(thread._id).populate('owner')
  
  // Show "Thinking" status while processing
  await bot.sendChatAction(freshThread.owner.chatId, "typing")
  
  let assistantReply = await sendThreadToChatGPT({ thread: freshThread, bot })

  // Log assistant reply
  console.log(`[ASSISTANT REPLY] To ${freshThread.owner.username || freshThread.owner.chatId}: ${assistantReply}`)

  // Add the assistant's message to thread
  await new Message({
    thread: freshThread._id,
    role: 'assistant',
    content: assistantReply
  }).save()

  if (assistantReply) {
    await sendThreadToUser({ user: freshThread.owner, content: assistantReply, bot, dict })
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
        temperature: 1 
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
          chatCompletion.model || process.env.CLAUDE_MODEL
        )
      }
      
      return chatCompletion.content[0].text
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

// Helper function to get all messages for a thread
export async function getThreadMessages(threadId: string): Promise<IMessage[]> {
  return await Message.find({ thread: threadId }).sort({ created: 1 })
}