import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"
import Thread from '../models/threads'
import Message from '../models/messages'
import { Types } from 'mongoose'
import { IThread } from "../interfaces/threads"
import { IUser } from "../interfaces/users"
import { IMessage } from "../interfaces/messages"
import { sendMessage } from "../templates/sendMessage"
import { analyzeConversation, formatMessagesWithImages, IConversationAnalysisResult, saveImagePermanently } from "../services/ai"
import { logTokenUsage, logWebSearchUsage } from "./tokens"
import { saveAIResponse } from "../helpers/fileLogger"
import { withChatAction } from "../helpers/chatAction"
import { trackExpense, editTransaction, createBudget, getBudgetInfoString, deleteBudget, deleteTransaction, getTransactionsString } from "./expense"
import { financeTools, searchTool, imageGenerationTool } from "../helpers/tools"
import { promptsDict } from "../helpers/prompts"
import { logApiError } from "../helpers/errorLogger"
import { callLLM, LLMRequest, isToolUse } from "../services/llm"
import { generateImageWithFallback, ImageGenerationResult } from '../services/image'
import Image from '../models/images'
import { getCurrentTier, getPeriodImageLimit, isImageLimit, sendGeneratedImage } from './images'

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

export async function getThreadMessages(thread: IThread): Promise<IMessage[]> {
  const fullThread = await Thread.findById(thread._id)
  
  // Simple case: no parent, just get own messages
  if (!fullThread.parent?.thread) {
    return Message.find({ thread: thread._id }).sort({ created: 1 }).populate('images')
  }
  
  // Branched thread: get parent messages up to branch point, then own messages
  const parentMessages = await Message.find({ 
    thread: fullThread.parent.thread,
    _id: { $lte: fullThread.parent.point }  // Messages up to and including branch point
  }).sort({ created: 1 }).populate('images')
  
  const ownMessages = await Message.find({ thread: thread._id }).sort({ created: 1 }).populate('images')
  
  return [...parentMessages, ...ownMessages]
}

async function processUploadedImages( imageIds: string[], user: IUser, threadId: any, bot: TelegramBot ): Promise<any[]> {
  const imageObjectIds: any[] = []

  for (const telegramFileId of imageIds) {
    try {
      const fileLink = await bot.getFileLink(telegramFileId)
      const localPath = await saveImagePermanently(fileLink, telegramFileId)
      
      const image = await new Image({
        user: user._id,
        telegramFileId,
        localPath,
        threadId,
        provider: 'unknown'  // User-uploaded, not AI-generated
      }).save()
      
      imageObjectIds.push(image._id)
    } catch (error) {
      console.error(`Error processing image ${telegramFileId}:`, error)
    }
  }
  
  return imageObjectIds
}

export async function handleUserReply( user: IUser, userReply: string, bot: TelegramBot, images: string[] = [], mediaGroupId?: string, replyToTelegramMessageId?: number, userTelegramMessageId?: number ): Promise<{ thread: IThread, isNew: boolean, oldMessageNotFound?: boolean }> {
  let thread: IThread = await getRecentThread(user);
  
  // Process images: save to disk and create Image documents
  let imageObjectIds: any[] = []
  if (images.length > 0) {
    imageObjectIds = await processUploadedImages(images, user, thread._id, bot)
  }
  
  console.log('imageObjectIds:', imageObjectIds)

  // Handle media group
  if (mediaGroupId) {
    console.log('mediaGroupId', mediaGroupId)
    const lastMediaMessage = await Message.findOne({ 
      thread: thread._id, 
      mediaGroupId,
      role: 'user'
    }).sort({ created: -1 });
    
    if (lastMediaMessage) {
      lastMediaMessage.images = lastMediaMessage.images || [];
      lastMediaMessage.images.push(...imageObjectIds);
      if (userReply?.trim()) lastMediaMessage.content = userReply;
      await lastMediaMessage.save();
      return { thread, isNew: false };
    }
    
    await new Message({
      thread: thread._id,
      role: 'user',
      content: userReply || " ",
      images: imageObjectIds.length > 0 ? imageObjectIds : undefined,
      mediaGroupId,
      telegramMessageId: userTelegramMessageId
    }).save();
    return { thread, isNew: false };
  }

  // Reply to old message
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
          
          // Re-process images for new thread if any
          if (images.length > 0) {
            imageObjectIds = await processUploadedImages(images, user, thread._id, bot)
          }
          
          // Save user message and return
          await new Message({
            thread: thread._id,
            role: 'user',
            content: userReply || " ",
            images: imageObjectIds.length > 0 ? imageObjectIds : undefined,
            telegramMessageId: userTelegramMessageId
          }).save()
          
          return { thread, isNew: true }
        }
      }
    }
  }

  // Conversation analysis
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
  let message = await new Message({
    thread: thread._id,
    role: 'user',
    content: userReply || " ",
    images: imageObjectIds.length > 0 ? imageObjectIds : undefined,
    telegramMessageId: userTelegramMessageId
  }).save();

  console.log('Message', message)

  return { thread, isNew: false };
}

export async function handleAssistantReply(thread: IThread, bot: TelegramBot, dict: Dict): Promise<void> {
  try {
    const freshThread = await Thread.findById(thread._id).populate('owner')

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
    // console.error('Error in handleAssistantReply:', error);
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
    console.log('threadMessages:', threadMessages)
    
    // const ownMessages = await Message.find({ thread: thread._id })
    // const isNewThread = ownMessages.length === 1
    
    const formattedMessages = await formatMessagesWithImages(threadMessages, user, bot)
    console.log('formattedMessages:', formattedMessages)
    const messages = [...formattedMessages]
    console.log('messages', messages)
    const executedFunctions = []
    let usedModel = ''
    
    // Get previous images from messages in this conversation context (respects branch points)
    const imageIdsFromMessages = threadMessages
      .filter(msg => msg.imageId)
      .map(msg => msg.imageId)
    
    const threadImages = imageIdsFromMessages.length > 0
      ? await Image.find({ _id: { $in: imageIdsFromMessages } }).sort({ created: -1 })
      : []
    
    const imagesContext = threadImages.length > 0 
      ? threadImages.map(img => `- ID: ${img._id}, prompt: "${img.prompt.slice(0, 100)}...", created: ${img.created}`).join('\n')
      : 'No previous images in this conversation.'
    
    while (true) {
      try {
        // Always include image generation tool
        let tools: any[] = [...imageGenerationTool];
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

        // Build system prompt with images context
        let systemPrompt = freshThread.assistantType === 'finance' 
          ? promptsDict.finance(transactionsInfo, budgetInfo) 
          : promptsDict.system();
        
        // Add images context to system prompt
        systemPrompt += `\n\n# Previous Images in Conversation\n${imagesContext}`

        const request: LLMRequest = {
          model: process.env.MODEL_NORMAL || process.env.CLAUDE_MODEL,
          system: systemPrompt,
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
        console.log('toolUses:', toolUses)

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
          return finalResponse;
        }

        // Process tool calls
        const toolResults = [];
        
        for (const toolUse of toolUses) {
          let result: string;
          
          executedFunctions.push({ name: toolUse.name, input: toolUse.input });

          // Handle image generation tool
          if (toolUse.name === 'generateImage') {
            result = await handleImageGenerationTool(
              toolUse.input as { prompt: string; editImageId?: string }, 
              user, 
              freshThread, 
              bot
            );
            console.log('tool result:', result)
          }
          // Finance tools
          else if (toolUse.name === 'trackExpense') {
            result = await trackExpense(user, toolUse.input);
          } else if (toolUse.name === 'editTransaction') {
            result = await editTransaction(user, toolUse.input);
          } else if (toolUse.name === 'deleteTransaction') {
            result = await deleteTransaction(user, toolUse.input);
          } else if (toolUse.name === 'createBudget') {
            result = await createBudget(user, toolUse.input);
          } else if (toolUse.name === 'deleteBudget') {
            result = await deleteBudget(user, toolUse.input);
          } else if (toolUse.name === 'loadMore') {
            const moreTransactions = await getTransactionsString(user, {
              count: toolUse.input.count || 20,
              start_date: toolUse.input.start_date,
              end_date: toolUse.input.end_date,
              includeBudgetInfo: false
            });
            result = moreTransactions;
          } else {
            result = `Unknown tool: ${toolUse.name}`;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result
          });
        }

        messages.push({ role: "user", content: toolResults });
        
      } catch (error) {
        // console.error('Error in chatWithFunctionCalling loop:', error);
        await logApiError('llm', error, `Chat function calling failed for thread ${thread._id}`);
        throw error;
      }
    }
  } catch (error) {
    // console.error('Error in chatWithFunctionCalling:', error);
    throw error;
  }
}

async function handleImageGenerationTool(
  input: Record<string, any>,
  user: IUser,
  thread: IThread,
  bot: TelegramBot
): Promise<string> {
  const { prompt, editImageId } = input as { prompt: string; editImageId?: string };
  
  // Validate prompt exists
  if (!prompt || typeof prompt !== 'string') {
    return 'Error: No prompt provided for image generation.';
  }
  
  try {
    // Check image limit
    if (await isImageLimit(user)) {
      const imageLimit = await getPeriodImageLimit(user);
      return `Error: Daily image generation limit reached (${imageLimit} images). The user should try again tomorrow.`;
    }

    // Get current tier based on usage
    const tier = await getCurrentTier(user);
    console.log(`[Image Tool] User tier: ${tier}`);

    // Look up previous image for multi-turn if editImageId provided
    let image: { multiTurnData?: any; provider?: string; path?: string } | undefined;
    if (editImageId) {
      const previousImage = await Image.findById(editImageId);
      if (previousImage) {
        image = {
          multiTurnData: previousImage.multiTurnData,
          provider: previousImage.provider,
          path: previousImage.localPath
        };
        console.log(`[Image Tool] Found previous image ${editImageId}, provider: ${image.provider}`);
      }
    }

    // Generate image with tier-based model selection
    const result: ImageGenerationResult = await withChatAction(
      bot,
      user.chatId,
      'upload_photo',
      () => generateImageWithFallback({ prompt, tier, image })
    );

    // Use actual tier (may have fallen back from top to normal)
    const actualTier = result.actualTier;
    console.log(`[Image Tool] Actual tier used: ${actualTier}`);

    // Send image to user and save to DB
    const { imageDoc, sentPhoto } = await sendGeneratedImage({
      prompt,
      user,
      bot,
      result,
      tier: actualTier,
      threadId: thread._id.toString()
    });

    // Save image as a Message so reply functionality works
    await new Message({
      thread: thread._id,
      role: 'assistant',
      content: null,
      imageId: imageDoc._id,
      telegramMessageId: sentPhoto.message_id
    }).save();

    // Return success message with image ID for potential future edits
    return `Image generated successfully. Image ID: ${imageDoc._id}. The image has been sent to the user.`;

  } catch (error: any) {
    console.error('Error in handleImageGenerationTool:', error);
    await logApiError('image', error, `Image generation tool failed`);
    
    if (error.reason === 'blocked' || error.reason === 'safety') {
      return 'Error: Image could not be generated due to content safety restrictions. Please ask the user to modify their request.';
    }
    
    return `Error generating image: ${error.message}. Please inform the user and suggest they try again.`;
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