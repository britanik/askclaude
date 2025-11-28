import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"
import Thread from '../models/threads'
import Message from '../models/messages'
import { IThread } from "../interfaces/threads"
import { IUser } from "../interfaces/users"
import { IMessage } from "../interfaces/messages"
import { sendMessage } from "../templates/sendMessage"
import { analyzeConversation, formatMessagesWithImages, IConversationAnalysisResult, saveImagePermanently } from "../services/ai"
import { logTokenUsage, logWebSearchUsage } from "./tokens"
import { saveAIResponse } from "../helpers/fileLogger"
import { withChatAction } from "../helpers/chatAction"
import { getReplyFooter, isAdmin } from "../helpers/helpers"
import { trackExpense, editTransaction, createBudget, getBudgetInfoString, deleteBudget, deleteTransaction, getTransactionsString } from "./expense"
import { financeTools, searchTool } from "../helpers/tools"
import { promptsDict } from "../helpers/prompts"
import { logApiError } from "../helpers/errorLogger"
import { callLLM, LLMRequest, isToolUse } from "../services/llm"

export interface IAssistantParams {
  user: IUser
  firstMessage?: string
  assistantType?: 'normal' | 'finance' | 'websearch'
}

export async function startAssistant(params:IAssistantParams): Promise<IThread> {
  const { user, firstMessage, assistantType = 'normal' } = params
  try {
    // Create a new thread
    const thread: IThread = await new Thread({ 
      owner: user, 
      assistantType
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

/**
 * Get all messages for a thread, including parent thread messages if it's a branch.
 * For branched threads: parent messages (up to branch point) + own messages
 */
export async function getThreadMessages(thread: IThread): Promise<IMessage[]> {
  const fullThread = await Thread.findById(thread._id)
  
  // Simple case: no parent, just get own messages
  if (!fullThread.parent?.thread) {
    return Message.find({ thread: thread._id }).sort({ created: 1 })
  }
  
  // Branched thread: get parent messages up to branch point, then own messages
  const parentMessages = await Message.find({ 
    thread: fullThread.parent.thread,
    _id: { $lte: fullThread.parent.point }  // Messages up to and including branch point
  }).sort({ created: 1 })
  
  const ownMessages = await Message.find({ thread: thread._id }).sort({ created: 1 })
  
  return [...parentMessages, ...ownMessages]
}

export async function handleUserReply( 
  user: IUser, 
  userReply: string, 
  bot: TelegramBot, 
  images: string[] = [], 
  mediaGroupId?: string,
  replyToTelegramMessageId?: number,
  userTelegramMessageId?: number
): Promise<{ thread: IThread, isNew: boolean, oldMessageNotFound?: boolean }> {
  let thread: IThread = await getRecentThread(user);
  
  // Process images if any
  if (images.length > 0) {
    for (const imageId of images) {
      try {
        const fileLink = await bot.getFileLink(imageId);
        await saveImagePermanently(fileLink, imageId);
      } catch (error) {
        console.error(`Error saving image ${imageId}:`, error);
      }
    }
  }

  // Handle media group
  if (mediaGroupId) {
    const lastMediaMessage = await Message.findOne({ 
      thread: thread._id, 
      mediaGroupId,
      role: 'user'
    }).sort({ created: -1 });
    
    if (lastMediaMessage) {
      lastMediaMessage.images = lastMediaMessage.images || [];
      lastMediaMessage.images.push(...images);
      if (userReply?.trim()) lastMediaMessage.content = userReply;
      await lastMediaMessage.save();
      return { thread, isNew: false };
    }
    
    await new Message({
      thread: thread._id,
      role: 'user',
      content: userReply || " ",
      images: images.length > 0 ? images : undefined,
      mediaGroupId,
      telegramMessageId: userTelegramMessageId
    }).save();
    return { thread, isNew: false };
  }

  // ===== HANDLE REPLY TO OLD MESSAGE =====
  if (replyToTelegramMessageId) {
    // Find the message user replied to
    const repliedMessage = await Message.findOne({ telegramMessageId: replyToTelegramMessageId })
    
    if (!repliedMessage) {
      // Message not found - it's from before we started tracking
      console.log(`[REPLY] Message ${replyToTelegramMessageId} not found in DB`)
      return { thread: null, isNew: false, oldMessageNotFound: true }
    }
    
    if (repliedMessage) {
      // Verify it belongs to this user's thread
      const repliedThread = await Thread.findOne({ 
        _id: repliedMessage.thread, 
        owner: user._id 
      }).populate('owner')
      
      if (repliedThread) {
        // Check if it's the last message (continue) or older (branch)
        const lastMessage = await Message.findOne({ thread: repliedThread._id }).sort({ created: -1 })
        const isLastMessage = lastMessage?._id.equals(repliedMessage._id)
        
        if (isLastMessage) {
          // Continue existing thread
          thread = repliedThread
        } else {
          // Create branch thread
          thread = await new Thread({
            owner: user,
            assistantType: repliedThread.assistantType,
            parent: {
              thread: repliedThread._id,
              point: repliedMessage._id
            }
          }).save()
          
          console.log(`[BRANCH] Created ${thread._id} from ${repliedThread._id}`)
          
          // Save user message and return
          await new Message({
            thread: thread._id,
            role: 'user',
            content: userReply || " ",
            images: images.length > 0 ? images : undefined,
            telegramMessageId: userTelegramMessageId
          }).save()
          
          return { thread, isNew: true }
        }
      }
    }
  }

  // ===== CONVERSATION ANALYSIS (if enabled) =====
  const isAnalysisEnabled = parseInt(process.env.ENABLE_CONVERSATION_ANALYSIS || '0') === 1;
  let assistantType: 'normal' | 'finance' | 'websearch' = 'normal';
  let shouldCreateNewThread = false;
  
  if (isAnalysisEnabled) {
    const lastMessages = await Message.find({ thread: thread._id }).sort({ created: -1 }).limit(5);
    if (lastMessages.length > 0) {
      const formattedMessages = lastMessages.reverse().map(msg => ({ role: msg.role, content: msg.content || "" }));
      const analysis: IConversationAnalysisResult = await analyzeConversation(formattedMessages, userReply);
      assistantType = analysis.assistant;
      shouldCreateNewThread = analysis.action === 'new';
    }
  }
  
  if (shouldCreateNewThread) {
    thread = await startAssistant({ user, firstMessage: userReply, assistantType });
    return { thread, isNew: true };
  }

  if (assistantType === 'finance' && thread.assistantType !== 'finance') {
    thread.assistantType = 'finance';
    await thread.save();
  }
  
  // Save user message
  await new Message({
    thread: thread._id,
    role: 'user',
    content: userReply || " ",
    images: images.length > 0 ? images : undefined,
    telegramMessageId: userTelegramMessageId
  }).save();

  return { thread, isNew: false };
}

export async function handleAssistantReply(thread: IThread, bot: TelegramBot, dict: Dict): Promise<void> {
  try {
    const assistantReply = await withChatAction(
      bot,
      thread.owner.chatId,
      'typing',
      () => chatWithFunctionCalling({ thread, bot })
    );

    await saveAIResponse(assistantReply, 'response');

    // Send to user and get telegram message ID
    let telegramMessageId: number | undefined;
    if (assistantReply) {
      const result = await sendMessage({ text: assistantReply, user: thread.owner, bot });
      telegramMessageId = result?.telegramMessageId;
    }

    // Save assistant message with telegram ID
    await new Message({
      thread: thread._id,
      role: 'assistant',
      content: assistantReply,
      telegramMessageId
    }).save();

  } catch (error) {
    console.error('Error in handleAssistantReply:', error);
    await logApiError('anthropic', error, `Assistant reply failed for thread ${thread._id}`);
    await sendMessage({ text: dict.getString('ASSISTANT_ERROR'), user: thread.owner, bot });
  }
}

export async function getRecentThread(user: IUser): Promise<IThread> {
  try {
    let recentThread = await Thread.findOne({ owner: user }).sort({ created: -1 }).populate('owner')
    if (!recentThread) {
      recentThread = await createNewThread({ user, messages: [] })
    }
    return recentThread
  } catch(e) {
    console.log('Failed to getRecentThread', e)
  }
}

async function chatWithFunctionCalling(params: { thread: IThread, bot: TelegramBot }) {
  const { thread, bot } = params
  
  try {
    const freshThread = await Thread.findById(thread._id).populate('owner')
    const user = freshThread.owner
    
    // Get all messages (handles branched threads automatically)
    const threadMessages = await getThreadMessages(freshThread)
    
    const ownMessages = await Message.find({ thread: thread._id })
    const isNewThread = ownMessages.length === 1
    
    const formattedMessages = await formatMessagesWithImages(threadMessages, user, bot)
    const messages = [...formattedMessages]
    const executedFunctions = []
    let usedModel = ''
    
    while (true) {
      try {
        let tools = [];
        let transactionsInfo = '';
        let budgetInfo = '';
        
        if (freshThread.assistantType === 'websearch') {
          tools = [...searchTool, ...tools]
        }

        if (freshThread.assistantType === 'finance') {
          tools = [...financeTools, ...tools]
          transactionsInfo = await getTransactionsString(user)
          budgetInfo = await getBudgetInfoString(user)
        }

        const request: LLMRequest = {
          model: process.env.MODEL_NORMAL || process.env.CLAUDE_MODEL,
          system: freshThread.assistantType === 'finance' 
            ? promptsDict.finance(transactionsInfo, budgetInfo) 
            : promptsDict.system(),
          messages: messages,
          max_tokens: +(process.env.CLAUDE_MAX_OUTPUT || 4096),
          temperature: 1,
        }
        
        if (tools.length > 0) {
          request.tools = tools;
        }

        const response = await callLLM(request)
        usedModel = response.model || request.model
        
        if (response.usage) {
          await logTokenUsage(
            user, freshThread, 
            response.usage.input_tokens || 0,
            response.usage.output_tokens || 0,
            usedModel, bot
          )
          
          if (response.usage.server_tool_use?.web_search_requests) {
            await logWebSearchUsage(user, freshThread, response.usage.server_tool_use.web_search_requests, usedModel, bot);
          }
        }

        messages.push({ role: "assistant", content: response.content });

        const toolUses = response.content.filter(isToolUse);
        
        if (toolUses.length === 0) {
          let responseText = '';
          let searchResults = [];
          
          for (const item of response.content || []) {
            if (item.type === 'text') {
              responseText += item.text;
            } else if (item.type === 'web_search_tool_result' && item.content) {
              for (const result of item.content) {
                if (result.type === 'web_search_result') {
                  searchResults.push({ title: result.title, url: result.url });
                }
              }
            }
          }
          
          let finalResponse = '';
          if (searchResults.length > 0) {
            finalResponse += '<b>🔍 Источники:</b>\n';
            searchResults.slice(0, 3).forEach((r, i) => {
              finalResponse += `${i + 1}. <a href="${r.url}">${r.title}</a>\n`;
            });
            finalResponse += '\n';
          }
          
          if (executedFunctions.length > 1 && freshThread.assistantType === 'finance') {
            const trackCalls = executedFunctions.filter(f => f.name === 'trackExpense');
            if (trackCalls.length > 1) {
              finalResponse += `<b>✅ Обработано ${trackCalls.length} транзакций:</b>\n`;
              trackCalls.forEach((c, i) => {
                finalResponse += `${i + 1}. ${c.input.amount} ${c.input.currency} - ${c.input.description}\n`;
              });
              finalResponse += '\n';
            }
          }
          
          finalResponse += responseText;
          
          if (isAdmin(user)) {
            finalResponse += getReplyFooter(freshThread.assistantType, isNewThread, usedModel);
          }
          
          return finalResponse;
        }

        const toolResults = [];
        for (const toolUse of toolUses) {
          try {
            const toolResult = await executeFunction(toolUse.name, toolUse.input, user);
            executedFunctions.push({ name: toolUse.name, input: toolUse.input, result: toolResult });
            toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: toolResult });
          } catch (error) {
            await logApiError('llm', error, `Function ${toolUse.name} failed`);
            executedFunctions.push({ name: toolUse.name, input: toolUse.input, result: `Error: ${error.message}`, failed: true });
            toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Error: ${error.message}`, is_error: true });
          }
        }

        messages.push({ role: "user", content: toolResults });
      } catch (error) {
        await logApiError('llm', error, 'LLM API call failed')
        throw error
      }
    }
  } catch(e) {
    console.log('Failed to process thread:', e)
    throw e
  }
}

async function executeFunction(functionName: string, input: any, user: IUser): Promise<string> {
  switch (functionName) {
    case 'trackExpense': return trackExpense(user, input);
    case 'editTransaction': return editTransaction(user, input);
    case 'deleteTransaction': return deleteTransaction(user, input);
    case 'loadMore': return getTransactionsString(user, { ...input, includeBudgetInfo: true });
    case 'createBudget': return createBudget(user, input);
    case 'deleteBudget': return deleteBudget(user, input);
    default: throw new Error(`Unknown function: ${functionName}`);
  }
}

export async function sendThreadToUser(params: { user: IUser, content?: string, bot: TelegramBot, dict: Dict }) {
  const { user, content, bot } = params
  try {
    return await sendMessage({ text: content, user, bot })
  } catch(e) {
    console.log('Failed to sendThreadToUser', e)
  }
}