import TelegramBot, { InlineKeyboardButton, InputMediaPhoto, KeyboardButton } from 'node-telegram-bot-api'
import { getOptions } from '../helpers/helpers'
import { IUser } from '../interfaces/users'
import * as userController from '../controllers/users'
import { addLog } from '../controllers/log'

export interface ISendMessageParams {
  user: IUser,
  chatId?: number, // Chat ID to send the message to 
  bot: TelegramBot,
  text?: string, // Optional: Text of the message to be sent
  deletable?: string, // If possible to delete - store in user.messages
  buttons?: InlineKeyboardButton[][], // Optional: Buttons to include in the message
  keyboard?: KeyboardButton[][], // Optional: Keyboard to include in the message
  gallery?: InputMediaPhoto[] // Optional: Gallery of photos to send before the message
  placeholder?: string, // Placeholder text for force reply
  timer?: number // Time in ms after which to delete the message
}

// Function to split message while preserving HTML tags
function splitMessageWithHtml(text: string, maxLength: number = 3700): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  // Define valid HTML tags supported by Telegram
  const validTagNames = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'span', 'a', 'code', 'pre', 'blockquote'];
  
  const chunks: string[] = [];
  let currentChunk = '';
  let activeTagStack: string[] = [];
  let i = 0;
  
  // Helper function to safely find end of tag
  const findTagEnd = (start: number): number => {
    let j = start + 1;
    let depth = 0;
    
    while (j < text.length) {
      if (text[j] === '<') depth++;
      if (text[j] === '>') {
        if (depth === 0) return j;
        depth--;
      }
      j++;
    }
    
    return -1; // No closing '>' found
  };
  
  // Helper function to extract tag name safely
  const extractTagName = (tag: string): string => {
    // For closing tags
    if (tag.startsWith('</')) {
      const match = tag.match(/^<\/([a-zA-Z0-9]+)/);
      return match ? match[1].toLowerCase() : '';
    }
    
    // For opening tags
    const match = tag.match(/^<([a-zA-Z0-9]+)(?:\s|\/|>)/);
    return match ? match[1].toLowerCase() : '';
  };
  
  // Helper function to check if a tag is self-closing
  const isSelfClosingTag = (tag: string): boolean => {
    return tag.endsWith('/>') || tag.match(/<(br|hr|img|input|link|meta)[\s>]/i) !== null;
  };

  while (i < text.length) {
    // Handle HTML tags
    if (text[i] === '<') {
      const tagEndIndex = findTagEnd(i);
      
      if (tagEndIndex === -1) {
        // Malformed HTML, just add the '<' character and continue
        currentChunk += text[i];
        i++;
        continue;
      }
      
      const tag = text.substring(i, tagEndIndex + 1);
      const isClosingTag = tag.startsWith('</');
      const tagName = extractTagName(tag);
      
      // Only track valid tags that Telegram supports
      if (validTagNames.includes(tagName)) {
        // Handle tag stack for proper nesting
        if (!isClosingTag && !isSelfClosingTag(tag)) {
          activeTagStack.push(tagName);
        } else if (isClosingTag) {
          // Find and remove the matching opening tag
          const openTagIndex = activeTagStack.lastIndexOf(tagName);
          if (openTagIndex !== -1) {
            activeTagStack.splice(openTagIndex, 1);
          }
        }
      }
      
      // Add the tag to current chunk
      currentChunk += tag;
      i = tagEndIndex + 1;
    } else {
      // Add regular character
      currentChunk += text[i];
      i++;
    }
    
    // Check if we need to end this chunk
    // We split at a more conservative length and try to split at natural boundaries
    if (currentChunk.length >= maxLength) {
      // Try to find a good breaking point - prefer line breaks, then spaces
      let breakPoint = -1;
      
      // Look up to 300 characters back for a good breaking point
      for (let lookback = 0; lookback < 300 && lookback < currentChunk.length; lookback++) {
        const pos = currentChunk.length - lookback - 1;
        
        // Best: line breaks
        if (currentChunk[pos] === '\n') {
          breakPoint = pos + 1; // Break after the newline
          break;
        }
        
        // Second best: spaces
        if (currentChunk[pos] === ' ' && breakPoint === -1) {
          breakPoint = pos + 1; // Break after the space
        }
      }
      
      // If no good breaking point found, create a hard break
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = maxLength;
      }
      
      // Split the chunk
      const chunkToAdd = currentChunk.substring(0, breakPoint);
      chunks.push(chunkToAdd);
      
      // Create the new chunk with open tags
      let newChunk = '';
      for (const tag of activeTagStack) {
        newChunk += `<${tag}>`;
      }
      
      // Add the remainder to the new chunk
      newChunk += currentChunk.substring(breakPoint);
      currentChunk = newChunk;
    }
  }
  
  // Add any remaining content as the final chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  // Close all remaining tags in the last chunk
  if (chunks.length > 0 && activeTagStack.length > 0) {
    for (let j = activeTagStack.length - 1; j >= 0; j--) {
      chunks[chunks.length - 1] += `</${activeTagStack[j]}>`;
    }
  }
  
  return chunks;
}

export async function sendMessage(params: ISendMessageParams) {
  let { user, chatId, bot, text = 'Test message', deletable, buttons, keyboard, gallery, placeholder, timer } = params;
  try {
    let sent: TelegramBot.Message;
    let sentMessages: TelegramBot.Message[] = [];

    let options = getOptions({ 
      buttons, 
      keyboard, 
      placeholder 
    });

    // Determine the target chat ID
    const targetChatId = chatId || user.chatId;

    if (deletable && user) {
      let messageId = userController.getMessage(user, deletable);
      if (messageId) {
        // Edit existing message if it exists
        let editOptions = {
          chat_id: targetChatId,
          message_id: messageId,
          parse_mode: 'HTML' as const,
          disable_web_page_preview: true
        };

        // Include only inline_keyboard in editOptions if buttons are provided
        if (buttons) {
          editOptions['reply_markup'] = { inline_keyboard: buttons };
        }

        // Try to edit, if message is too long, delete existing and send a new one
        try {
          await bot.editMessageText(text, editOptions);
        } catch (e) {
          // If error is due to message length, delete and send new messages
          if (e.response && e.response.body && e.response.body.description && 
              e.response.body.description.includes('message is too long')) {
            // Delete the old message
            try {
              await bot.deleteMessage(targetChatId, messageId);
            } catch (deleteErr) {
              console.error('Error deleting old message:', deleteErr);
            }
            
            // Send as new messages
            const chunks = splitMessageWithHtml(text);
            
            if (gallery && gallery.length > 0) {
              // Send gallery in front if it exists
              await bot.sendMediaGroup(targetChatId, gallery);
            }
            
            // Send each chunk as a separate message
            for (let i = 0; i < chunks.length; i++) {
              // Only add buttons to the last chunk
              const useOptions = i === chunks.length - 1 ? options : getOptions({});
              try {
                sent = await bot.sendMessage(targetChatId, chunks[i], useOptions);
                sentMessages.push(sent);
              } catch (sendErr) {
                console.error(`Error sending message chunk ${i}:`, sendErr);
              }
            }
            
            // Update the user's message ID with the last sent message
            if (sentMessages.length > 0) {
              user = await userController.updateMessage(user, deletable, sentMessages[sentMessages.length - 1].message_id);
            }
          } else {
            throw e; // Re-throw other types of errors
          }
        }
      } else {
        // Send new message since no existing message to update
        if (gallery && gallery.length > 0) {
          // Send gallery in front if it exists
          await bot.sendMediaGroup(targetChatId, gallery);
        }
        
        // Check if the message needs to be split
        const chunks = splitMessageWithHtml(text);
        
        if (chunks.length === 1) {
          // Send as a single message
          try {
            sent = await bot.sendMessage(targetChatId, text, options);
            sentMessages.push(sent);
          } catch (e) {
            console.error('Error sending message:', e);
          }
        } else {
          // Send multiple chunks
          for (let i = 0; i < chunks.length; i++) {
            // Only add buttons to the last chunk
            const useOptions = i === chunks.length - 1 ? options : getOptions({});
            try {
              sent = await bot.sendMessage(targetChatId, chunks[i], useOptions);
              sentMessages.push(sent);
            } catch (e) {
              console.error(`Error sending message chunk ${i}:`, e);
            }
          }
        }
        
        // Store the last message ID for later reference
        if (sentMessages.length > 0) {
          user = await userController.updateMessage(user, deletable, sentMessages[sentMessages.length - 1].message_id);
        }
      }
    } else {
      // Send new message without considering it deletable
      if (gallery && gallery.length > 0) {
        // Send gallery in front if it exists
        await bot.sendMediaGroup(targetChatId, gallery);
      }
      
      // Check if the message needs to be split
      const chunks = splitMessageWithHtml(text);
      
      if (chunks.length === 1) {
        // Send as a single message
        sent = await bot.sendMessage(targetChatId, text, options);
        sentMessages.push(sent);
      } else {
        // Send multiple chunks
        for (let i = 0; i < chunks.length; i++) {
          // Only add buttons to the last chunk
          const useOptions = i === chunks.length - 1 ? options : getOptions({});
          sent = await bot.sendMessage(targetChatId, chunks[i], useOptions);
          sentMessages.push(sent);
        }
      }
    }

    // Set a timer to delete the message(s) if requested
    if (timer && sentMessages.length > 0) {
      setTimeout(async () => {
        try {
          for (const message of sentMessages) {
            await bot.deleteMessage(targetChatId, message.message_id);
          }
        } catch (err) {
          console.error('Failed to delete message(s):', err);
        }
      }, timer);
    }

  } catch (e) {
    // Error handling
    console.error(`[SEND_MESSAGE] Critical error:`, e);
    
    if (e.response) {
      console.error(`[SEND_MESSAGE] Critical API Response Error:`, {
        error_code: e.response.body?.error_code,
        description: e.response.body?.description,
        statusCode: e.response.statusCode
      });
    }
    
    // Block user if they blocked the bot
    if (e.response && e.response.body && e.response.body.error_code === 403) {
      user = await userController.blocked(user);
      await addLog({ method: 'sendMessageErrorBlocked', user, bot });
    }
  }
}

export interface IDeleteMessageParams {
  user: IUser,
  messageName: string,
  bot: TelegramBot
}

export async function deleteMessage( params: IDeleteMessageParams ):Promise<IUser>{
  let { user, messageName, bot } = params
  await bot.deleteMessage(user.chatId, user.messages[params.messageName])
  return userController.updateMessage(user, messageName, null)
}

export interface ISendPhotoParams {
  user: IUser,
  chatId?: number,
  bot: TelegramBot,
  buttons?: InlineKeyboardButton[][],
  media: string,
  caption: string,
  deletable?: string // if possible to delete - store in user.messages
}

export async function sendPhoto( options: ISendPhotoParams ){
  // console.log(options, 'sendMessage')
  let { user, chatId, bot, buttons, media, caption, deletable } = options

  try {
    chatId = ( chatId ) ? chatId : user.chatId

    if( deletable ){
      if( userController.getMessage(user, deletable) ){
        // already saved in user.messages - update
        let options = {
          message_id: userController.getMessage(user, deletable),
          chat_id: chatId,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: buttons
          }
        }
        let update = await bot.editMessageMedia({
          type: 'photo',
          media,
          caption
        }, options)
      } else {
        // send new
        let options = {
          caption,
          reply_markup: {
            inline_keyboard: buttons
          }
        }
        let sent = await bot.sendPhoto( user.chatId, media, options )
        user = await userController.updateMessage(user, deletable, sent.message_id )
        // console.log('Saved into user.messages')
      }
    }

  } catch( e ){
    // catch
    if( e.response && e.response.body && e.response.body.error_code === 403 ){
      user = await userController.blocked(user)
      console.log(e.response.body.error_code, 'Send text error')
    }
  } 
}

export interface ISendGalleryParams {
  user: IUser,
  bot: TelegramBot,
  media: string[],
}

export async function sendGallery( params:ISendGalleryParams ):Promise<void>{
  let { user, bot, media } = params
  let mediaGroup = []
  for( const photoId of media ){
    mediaGroup.push({
      type: 'photo',
      media: photoId,
    })
  }
  await bot.sendMediaGroup(user.chatId, mediaGroup)
}