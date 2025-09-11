import TelegramBot from "node-telegram-bot-api"
import moment from "moment"
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
import { isAdmin } from "../helpers/helpers"
import { createAccount, updateAccount, trackExpense, getUserAccountsString, getRecentTransactionsString, editTransaction, createBudget, getBudgetInfoString, deleteBudget, deleteTransaction } from "./expense"
import { financeTools, searchTool } from "../helpers/tools"
import { promptsDict } from "../helpers/prompts"
import axios from "axios"
import { logApiError } from "../helpers/errorLogger"

export interface IAssistantParams {
  user: IUser
  firstMessage?: string
  webSearch?: boolean
  assistantType?: 'normal' | 'finance'
}

export async function startAssistant(params:IAssistantParams): Promise<IThread> {
  const { user, firstMessage, webSearch = false, assistantType = 'normal' } = params
  try {
    // Create a new thread
    const thread: IThread = await new Thread({ 
      owner: user, 
      webSearch, 
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
    let assistantType: 'normal' | 'finance' = 'normal';

    // Web search disabled by default
    let webSearch = false;
    
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
        console.log(`[CONVERSATION ANALYSIS]`, analysis);
        
        webSearch = analysis.search || false;
        assistantType = analysis.assistant === 'finance' ? 'finance' : 'normal';
        
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
      assistantType,
    }

    if (shouldCreateNewThread) {
      thread = await startAssistant(startAssistantParams);
      console.log(`[NEW THREAD CREATED] For ${user.username || user.chatId} based on topic change analysis - Type: ${thread.assistantType}`);
      return { thread, isNew: true };
    }

    // If continuing with existing thread but assistant type changed to finance, update it
    if (assistantType === 'finance' && thread.assistantType !== 'finance') {
      thread.assistantType = 'finance';
      await thread.save();
      console.log(`[THREAD UPDATED] Changed to finance type`);
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
    console.error('Error in handleAssistantReply:', error.response.data);
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
    
    // Start the conversation loop
    const finalResponse = await chatWithFunctionCalling(formattedMessages, user, thread, bot)
    
    return finalResponse

  } catch(e) {
    console.log('Failed to send message to Anthropic API or other error:', e)
    throw e
  }
}

async function chatWithFunctionCalling(initialMessages, user, thread, bot) {
  const messages = [...initialMessages] // Copy initial messages
  const executedFunctions = [] // Track all function calls for summary
  
  while (true) {
    try {
      // Prepare tools array and context
      let tools = [];
      let accountsInfo = '';
      let transactionsInfo = '';
      let budgetInfo = '';
      
      if (thread.webSearch) {
        tools = [...searchTool, ...tools]
      }

      if (thread.assistantType === 'finance') {
        tools = [...financeTools, ...tools]
        accountsInfo = await getUserAccountsString(user)
        transactionsInfo = await getRecentTransactionsString(user)
        budgetInfo = await getBudgetInfoString(user)
        // console.log(budgetInfo,'budgetInfo')

        // console.log('---- accountsInfo -----')
        // console.info(accountsInfo)
        // console.log('---- transactionsInfo -----')
        // console.info(transactionsInfo)
        // console.log('----')  
      }

      // Prepare API request
      const chatParams: any = {
        model: process.env.CLAUDE_MODEL,
        system: thread.assistantType === 'finance' ? promptsDict.finance(accountsInfo, transactionsInfo, budgetInfo) : promptsDict.system(),
        messages: messages,
        max_tokens: +(process.env.CLAUDE_MAX_OUTPUT || 1000),
        stream: false,
        temperature: 1,
      }

      console.warn(chatParams.system,'chatParams.system')
      
      // Only add tools if available
      if (tools.length > 0) {
        chatParams.tools = tools;
      }

      // Send message to Claude
      const response = await makeClaudeAPICall(chatParams)
      // console.log(response.content,'response.content')
      
      // Log token usage
      if (response.usage) {
        const inputTokens = response.usage.input_tokens || 0
        const outputTokens = response.usage.output_tokens || 0
        await logTokenUsage(
          user, 
          thread, 
          inputTokens, 
          outputTokens,
          response.model || process.env.CLAUDE_MODEL,
          bot
        )
        
        // Log web search usage if any
        if (response.usage.server_tool_use?.web_search_requests) {
          await logWebSearchUsage(
            user,
            thread,
            response.usage.server_tool_use.web_search_requests,
            response.model || process.env.CLAUDE_MODEL,
            bot
          );
        }
      }

      // Add Claude's response to conversation
      messages.push({
        role: "assistant",
        content: response.content
      });

      // Check if Claude wants to use any tools
      const toolUses = response.content.filter(content => content.type === 'tool_use');
      
      if (toolUses.length === 0) {
        // No tool use, we're done - extract text response and search results
        let responseText = '';
        let searchResults = [];
        
        if (response.content && Array.isArray(response.content)) {
          for (const contentItem of response.content) {
            if (contentItem.type === 'text') {
              responseText += contentItem.text;
            } else if (contentItem.type === 'web_search_tool_result') {
              // Handle web search results
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
        }
        
        // Format final response with search results at the top
        let finalResponse = '';
        if (searchResults.length > 0) {
          finalResponse += '<b>🔍 Источники:</b>\n';
          searchResults.slice(0, 3).forEach((result, index) => {
            finalResponse += `${index + 1}. <a href="${result.url}">${result.title}</a>\n`;
          });
          finalResponse += '\n';
        }
        
        // Add summary for multiple function executions (finance assistant)
        if (executedFunctions.length > 1 && thread.assistantType === 'finance') {
          const trackExpenseCalls = executedFunctions.filter(f => f.name === 'trackExpense');
          if (trackExpenseCalls.length > 1) {
            finalResponse += `<b>✅ Обработано ${trackExpenseCalls.length} транзакций:</b>\n`;
            trackExpenseCalls.forEach((call, index) => {
              const { amount, description, currency } = call.input;
              finalResponse += `${index + 1}. ${amount} ${currency} - ${description}\n`;
            });
            finalResponse += '\n';
          }
        }
        
        finalResponse += responseText;
        
        return finalResponse;
      }

      // Execute all tools from this response
      const toolResults = [];
      
      for (const toolUse of toolUses) {
        try {
          console.log(`Executing tool: ${toolUse.name}`, toolUse.input);
          const toolResult = await executeFunction(toolUse.name, toolUse.input, user);
          
          // Track function execution for summary
          executedFunctions.push({
            name: toolUse.name,
            input: toolUse.input,
            result: toolResult
          });
          
          // Add tool result to the batch
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: toolResult
          });
          
        } catch (error) {
          console.error(`Error executing tool ${toolUse.name}:`, error);
          
          // Track failed function execution
          executedFunctions.push({
            name: toolUse.name,
            input: toolUse.input,
            result: `Error: ${error.message}`,
            failed: true
          });
          
          // Add error to the batch
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Error: ${error.message}`,
            is_error: true
          });
        }
      }
      
      // Send all tool results back to Claude in a single message
      messages.push({
        role: "user",
        content: toolResults
      });

      // Continue the loop to get Claude's response with the tool result
    } catch (error) {
      console.error('Claude API call failed:', error)
      throw error
    }
  }
}

async function executeFunction(functionName: string, input: any, user: IUser): Promise<string> {
  switch (functionName) {
    case 'createAccount':
      return await createAccount( user, input );
      
    case 'updateAccount':
      return await updateAccount( user, input );
      
    case 'trackExpense':
      return await trackExpense( user, input );
      
    case 'editTransaction':
      return await editTransaction( user, input );

    case 'deleteTransaction':
      return await deleteTransaction( user, input );

    case 'createBudget':
      return await createBudget( user, input );
    
    case 'deleteBudget':
      return await deleteBudget( user, input );
      
    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}

async function makeClaudeAPICall(chatParams: any) {
  try {
    // Make API request with primary model
    const request = await axios.post(
      'https://api.anthropic.com/v1/messages', 
      chatParams, 
      { 
        headers: {
          'x-api-key': process.env.CLAUDE_TOKEN, 
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: +process.env.CLAUDE_TIMEOUT
      }
    )

    return request.data
    
  } catch (primaryError) {
    // Log the primary error
    await logApiError('anthropic', primaryError, 'Primary model call failed')
    
    // Check if it's a 529 error or any server error (5xx)
    if (primaryError.response && (primaryError.response.status === 529 || 
        (primaryError.response.status >= 500 && primaryError.response.status < 600))) {
      
      console.log(`Primary model ${process.env.CLAUDE_MODEL} failed with status ${primaryError.response.status}, trying backup model...`)
      
      // Use backup model if primary fails
      const backupModel = process.env.CLAUDE_MODEL_BACKUP
              
      // Update model in request
      chatParams.model = backupModel
      
      try {
        // Try with backup model
        const backupRequest = await axios.post(
          'https://api.anthropic.com/v1/messages', 
          chatParams, 
          { 
            headers: {
              'x-api-key': process.env.CLAUDE_TOKEN, 
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            timeout: +process.env.CLAUDE_TIMEOUT
          }
        )
        
        console.log(`Received response from backup model ${backupModel}`)
        return backupRequest.data
      } catch (backupError) {
        // Log backup error as well
        logApiError('anthropic', backupError, 'Backup model call failed').catch(() => {})
        throw backupError
      }
    } else {
      // For other types of errors, rethrow
      throw primaryError
    }
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