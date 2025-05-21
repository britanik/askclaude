import TelegramBot, { InlineKeyboardButton, InputMediaPhoto, KeyboardButton } from 'node-telegram-bot-api'
import { getOptions } from '../helpers/helpers'
import { IUser } from '../interfaces/users'
import * as userController from '../controllers/users'
import { addLog } from '../controllers/log'
import { processMessageWithCodeBlocks } from '../helpers/telegraphHandler'
import { saveAIResponse } from '../helpers/fileLogger'

export interface ISendMessageParams {
  user: IUser,
  chatId?: number, // (not used): Chat ID to send the message to 
  bot: TelegramBot,
  text?: string, // Optional: Text of the message to be sent
  deletable?: string, // If possible to delete - store in user.messages
  buttons?: InlineKeyboardButton[][], // Optional: Buttons to include in the message
  keyboard?: KeyboardButton[][], // Optional: Keyboard to include in the message
  gallery?: InputMediaPhoto[] // Optional: Gallery of photos to send before the message
  placeholder?: string, // Добавляем новый параметр
  timer?: number
}

export async function sendMessage(params: ISendMessageParams) {
  let { user, chatId, bot, text = 'Test message', deletable, buttons, keyboard, gallery, placeholder, timer } = params;
  try {
    let sent: TelegramBot.Message;

    // Process any code blocks in the message first
    if (text && text.includes('<pre>')) {
      text = await processMessageWithCodeBlocks(text);
    }

    await saveAIResponse(text, 'send');

    let options = getOptions({ 
      buttons, 
      keyboard, 
      placeholder 
    });

    if (deletable && user) {
      let messageId = userController.getMessage(user, deletable);
      if (messageId) {
        // Edit existing message if it exists
        let editOptions = {
          chat_id: chatId || user.chatId,
          message_id: messageId,
          parse_mode: 'HTML' as const,
          disable_web_page_preview: true
        };

        // Include only inline_keyboard in editOptions if buttons are provided
        if (buttons) {
          editOptions['reply_markup'] = { inline_keyboard: buttons };
        }

        await bot.editMessageText(text, editOptions);
      } else {
        if (gallery && gallery.length > 0) {
          // Send gallery in front if it exists
          await bot.sendMediaGroup(chatId || user.chatId, gallery);
        }  
  
        // Send new message if no existing message to update
        try {
          sent = await bot.sendMessage(chatId || user.chatId, text, options);
        } catch (e) {
          console.log(e, 'e');
          throw e;
        }

        user = await userController.updateMessage(user, deletable, sent.message_id);
      }
    } else {
      if (gallery && gallery.length > 0) {
        // Send gallery in front if it exists
        await bot.sendMediaGroup(chatId || user.chatId, gallery);
      }  

      // Send new message without considering it deletable
      let chatIdToSent = chatId || user.chatId;
      try {
        sent = await bot.sendMessage(chatIdToSent, text, options);
      } catch (e) {
        // If message is still too long, we can add additional handling here
        if (e.response?.body?.description?.includes('too long')) {
          // Try to truncate the message or handle it differently
          console.log('Message still too long even after processing code blocks');
          
          // Send a simplified message indicating content was too long
          sent = await bot.sendMessage(
            chatIdToSent, 
            "⚠️ Message is too long. Please check the links for complete code.", 
            options
          );
        } else {
          console.log(e, 'e');
          throw e;
        }
      }
    }

    if (timer && sent) {
      setTimeout(async () => {
        try {
          await bot.deleteMessage(user.chatId, sent.message_id);
        } catch (err) {
          console.error('Failed to delete message:', err);
        }
      }, timer);
    }

  } catch (error) {
    // Error handling
    if (error.response && error.response.body && error.response.body.error_code === 403) {
      user = await userController.blocked(user);
      await addLog({ method: 'sendMessageErrorBlocked', user, bot });
    }

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Error Telegram sending:', error.response.body);
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
    if( e.response.body.error_code && e.response.body.error_code === 403 ){
      user = await userController.blocked(this.user)
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