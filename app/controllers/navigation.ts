import TelegramBot from "node-telegram-bot-api"
import { IUser } from "../interfaces/users"
import Dict from "../helpers/dict"
import * as userController from "./users"
import { IMenuButton } from "../interfaces/menu-button"
import { isMenuClicked } from "./menu"
import { sendMessage } from "../templates/sendMessage"
import { tmplRegisterLang } from "../templates/tmplRegisterLanguage"
import { handleAssistantReply, handleUserReply, IAssistantParams, startAssistant } from "./assistants"
import { tmplAdmin } from "../templates/tmplAdmin"
import { getTranscription } from "../services/ai"
import { isAdmin } from "../helpers/helpers"

import { tmplSettings } from '../templates/tmplSettings'
import { tmplInvite } from "../templates/tmplInvite"
import { getTokenLimitMessage, isTokenLimit, isWebSearchLimit, updateUserSchema } from "./tokens"
import { isValidInviteCode, processReferral } from "./invites"
import { sendNotification } from "./notifications"
import { getCurrentTier, getPeriodImageLimit, isImageLimit, moderateContent, sendGeneratedImage } from "./images"
import { IThread } from "../interfaces/threads"
import Message from "../models/messages"
import { generateUserStats } from "./stats"
import { regenerateImage } from "../controllers/images"
import { withChatAction } from "../helpers/chatAction"
import { generateImageWithFallback } from "../services/image"

export interface INavigationParams {
  user?: IUser
  callbackQuery?: any
  msg?: any
  dict: Dict
  bot: TelegramBot
  mediaGroups: number[]
}

export default class Navigation {
  private user: IUser
  private data: any
  private msg: any
  private dict: Dict
  private bot: TelegramBot
  private mediaGroups: number[]
  private rest: {
    user: IUser
    msg: any
    dict: Dict
    data: any
    bot: TelegramBot
  }

  constructor(params: INavigationParams) {
    this.user = params.user
    this.bot = params.bot
    this.msg = params.msg
    this.mediaGroups = params.mediaGroups
    this.dict = params.dict

    if (params.callbackQuery) {
      this.data = JSON.parse(params.callbackQuery.data)
    }

    this.rest = {
      user: this.user,
      msg: this.msg,
      dict: this.dict,
      data: this.data,
      bot: this.bot,
    }
  }

  async build() {
    const method = this.determineMethod()
    const actionType = this.determineActionType(method)

    if (!method && this.msg) {
      await this.notFound().action()
      return
    }

    console.log('execute', method, actionType)
    await this[method]()[actionType]()
  }

  private determineMethod(): string | null {
    if (this.data && this[this.data.a]) {
      return this.data.a;
    }
  
    if (this.msg) {
      const menuItem: IMenuButton | false = isMenuClicked(this.msg);
      if (menuItem) {
        return menuItem.method;
      }
  
      const step = userController.getStep(this.user);
      if (step) {
        return step;
      }
      
      // If no step is defined, default to assistant
      return 'assistant';
    }
  
    return null;
  }

  private determineActionType(method: string): 'action' | 'callback' {
    if (this.data && this[method]) {
      return 'callback'
    }

    if (this.msg) {
      const menuItem: IMenuButton | false = isMenuClicked(this.msg)
      return menuItem ? 'action' : 'callback'
    }

    return 'action'
  }

  private async resetUser() {
    console.log('reset user')
    this.user.messages = {}
    this.user.step = null
    this.user.data = null
    this.user = await this.user.save()
  }

  // Navigation methods
  start() {
    return {
      action: async () => {
        await this.language().action()
      },
      callback: async () => {},
    }
  }

  new() {
    return {
      action: async () => {
        await this.assistant().action()
      },
      callback: async () => {
        await this.assistant().action()
      },
    }
  }

  language() {
    return {
      action: async () => {
        await tmplRegisterLang(this.user, this.dict, this.bot)
      },
      callback: async () => {
        this.user = await userController.updatePref(this.user, 'lang', this.data.v)
        this.dict.setLang(this.data.v)
        
        // After setting language, show settings page first
        await tmplSettings(this.user, this.bot, this.dict);        
      },
    }
  }

  settings() {
    return {
      action: async () => {
        const { tmplSettings } = require('../templates/tmplSettings');
        await tmplSettings(this.user, this.bot, this.dict);
      },
      callback: async () => {
        if (this.data.v === 'code') {
          await this.enterCode().action();
        }
        if (this.data.v === 'invite') {
          await this.invite().action();
        }
        if (this.data.v === 'manual') {
          this.bot.sendDocument(
            this.user.chatId,
            process.env.DOCUMENT_PDF_MANUAL
          )  
        }
      },
    }
  }

  enterCode() {
    return {
      action: async () => {
        // Set step to wait for code input
        this.user = await userController.addStep(this.user, 'enterCode');
        await sendMessage({
          text: this.dict.getString('ENTER_CODE'),
          user: this.user,
          bot: this.bot,
        })
      },
      callback: async () => {
        // Process the entered code
        const enteredCode = this.msg.text;
        
        const isValid = await isValidInviteCode(enteredCode);
        
        if (isValid) {
          const success = await processReferral(this.user, isValid);
          
          if (success) {
            await sendMessage({ 
              text: "✅ Спасибо! Вы активировали код приглашения и получили 100,000 токенов!", 
              user: this.user, 
              bot: this.bot 
            });
          } else {
            await sendMessage({ 
              text: "🚫 Не удалось активировать код. Возможно, вы уже использовали код приглашения или пытаетесь использовать свой собственный код.", 
              user: this.user, 
              bot: this.bot 
            });
          }
        } else {
          await sendMessage({ 
            text: "🚫 Неверный код приглашения. Пожалуйста, проверьте код и попробуйте снова.", 
            user: this.user, 
            bot: this.bot 
          });
          // Keep in enterCodeStep to allow retry
          return;
        }
      },
    }
  }

  invite() {
    return {
      action: async () => {
        await tmplInvite(this.user, this.bot, this.dict);
      },
      callback: async () => {
      },
    }
  }

  assistant() {
    return {
      action: async () => {
        // Check token limit (both hourly and daily)
        if( await isTokenLimit(this.user) ){
          const limitMessage = await getTokenLimitMessage(this.user);
          await sendMessage({ text: limitMessage, user: this.user, bot: this.bot });
          return;
        }
  
        // Set user step to assistant
        this.user = await userController.addStep(this.user, 'assistant')
        
        // Get random welcome message instead of making API call
        const firstMessage = this.dict.getRandomWelcomeMessage();
        
        // Prepare parameters for starting the assistant
        let startAssistantParams:IAssistantParams = {
          user: this.user,
        }

        // if it's /search command
        if (this.msg && this.msg.text && this.msg.text.startsWith('/search')) {
          startAssistantParams.assistantType = 'websearch';
        }

        // Create a new thread with the welcome message
        let thread: IThread = await startAssistant(startAssistantParams);
        
        // Send welcome message and save with telegram ID
        const sent = await sendMessage({ text: firstMessage, user: this.user, bot: this.bot });
        
        await new Message({
          thread: thread._id,
          role: 'assistant',
          content: firstMessage,
          telegramMessageId: sent?.telegramMessageId
        }).save();
      },
      callback: async () => {
        // Check token limit (both hourly and daily)
        if( await isTokenLimit(this.user) ){
          const limitMessage = await getTokenLimitMessage(this.user);
          await sendMessage({ text: limitMessage, user: this.user, bot: this.bot });
          return;
        }

        try {
          let text: string = '';
          let images: string[] = [];
          let mediaGroupId = this.msg.media_group_id || null;
          
          // For thread branching: detect if user replied to an old message
          const replyToMessageId = this.msg.reply_to_message?.message_id;
          
          // console.log('this.msg:')
          // console.dir(this.msg, { depth: 5 })

          // Handle voice messages
          if (this.msg.voice) {
            text = await getTranscription(this.msg, this.bot);
          }
  
          // Handle photo messages
          else if (this.msg.photo && this.msg.photo.length > 0) {
            // Get the caption if it exists
            text = this.msg.caption || '';
            
            // Get the highest quality photo (last in array)
            const photoId = this.msg.photo[this.msg.photo.length - 1].file_id;
            images.push(photoId);
          }

          // Handle documents (files sent as attachments)
          else if (this.msg.document) {
            const mimeType = this.msg.document.mime_type;
            
            // HEIC not supported
            if (mimeType === 'image/heic' || mimeType === 'image/heif') {
              await sendMessage({ text: this.dict.getString('IMAGE_UNSUPPORTED_IMAGE_FORMAT'), user: this.user, bot: this.bot });
              return;
            }
            
            // JPG/PNG sent as document - treat as photo
            if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp' || mimeType === 'image/gif') {
              text = this.msg.caption || '';
              images.push(this.msg.document.file_id);
            }
          }
  
          // Handle regular text messages
          else {
            text = this.msg.text;
          }
          
          // For media groups, wait before processing to collect all images
          if (mediaGroupId) {
            console.log('mediaGroupId:', mediaGroupId)
            const isFirstMessageInGroup = !this.mediaGroups.includes(mediaGroupId);
            
            if (isFirstMessageInGroup) {
              // This is the first message from a media group
              this.mediaGroups.push(mediaGroupId);
              
              // Wait for other images in the group (3 seconds should be enough)
              console.log(`First message in media group ${mediaGroupId}, waiting for others...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
              console.log(`Finished waiting for media group ${mediaGroupId}`);
            } else {
              // For subsequent messages in the same media group, just add the image and return
              // without sending to Claude yet - this is handled by the first message
              console.log(`Additional message in media group ${mediaGroupId}`);
              await handleUserReply({
                user: this.user,
                userReply: text,
                imageIds: images,
                mediaGroupId: mediaGroupId,
                replyToTelegramMessageId: replyToMessageId,
                userTelegramMessageId: this.msg.message_id,
                bot: this.bot
              });
              return; // Important: don't process this as a full message
            }
          }
          
          // PROCESS MESSAGE
          
          // Analyze, save new Message, start new thread or return existing one
          let userReply = await handleUserReply({
            user: this.user,
            userReply: text,
            imageIds: images,
            mediaGroupId: mediaGroupId,
            replyToTelegramMessageId: replyToMessageId,
            userTelegramMessageId: this.msg.message_id,
            bot: this.bot
          });
          
          // If user replied to an old message we don't have tracked - just notify and stop
          if (userReply.oldMessageNotFound) {
            await sendMessage({
              text: '💬 Это сообщение было отправлено до включения функции ответов на старые сообщения.',
              user: this.user,
              bot: this.bot
            });
            return;
          }
          
          // Only send to Claude if this isn't a media group or it's the first message after waiting
          if (!mediaGroupId || this.mediaGroups.includes(mediaGroupId)) {
            
            const searchLimitReached:boolean = await isWebSearchLimit(this.user) || false;
            if (!searchLimitReached) {
              // CONTINUE HERE
              // Send thread to LLM and then it's reply to user
              await handleAssistantReply(userReply.thread, this.bot, this.dict);
            } else {
              // Exit
              await sendMessage({
                text: 'Достигнут дневной лимит на веб-поиск. Выполняю обычный запрос.',
                user: this.user,
                bot: this.bot
              })
            }
            
            // Remove from mediaGroups array after processing
            if (mediaGroupId) {
              const index = this.mediaGroups.indexOf(mediaGroupId);
              if (index > -1) {
                this.mediaGroups.splice(index, 1);
              }
            }
          }
        } catch (e) {
          console.error('Failed to handle assistant callback', e);
          await sendMessage({ text: this.dict.getString('ASSISTANT_ERROR'), user: this.user, bot: this.bot });
        }
      }
    }
  }

  image() {
    return {
      action: async () => {
        if (await isImageLimit(this.user)) {
          await sendMessage({ text: this.dict.getString('SETTINGS_IMAGE_LIMIT_EXCEEDED', { limit: await getPeriodImageLimit(this.user) }), user: this.user, bot: this.bot });
          return;
        }

        this.user = await userController.addStep(this.user, 'image')

        // Send prompt asking user to describe the image they want
        await sendMessage({ text: this.dict.getString('IMAGE_ASK_PROMPT'), user: this.user, bot: this.bot });
      },
      callback: async () => {
        console.log('image().callback()')
        const prompt = this.msg?.text?.trim();
        
        // Validate prompt
        if (!prompt) {
          await sendMessage({ text: this.dict.getString('IMAGE_NO_PROMPT'), user: this.user, bot: this.bot });
          return;
        }

        // Check image limit
        if (await isImageLimit(this.user)) {
          await sendMessage({ text: this.dict.getString('SETTINGS_IMAGE_LIMIT_EXCEEDED', { limit: await getPeriodImageLimit(this.user) }), user: this.user, bot: this.bot });
          return;
        }

        // Check for NSFW content
        const moderation = await moderateContent(prompt);
        if (moderation.flagged && moderation.scores.sexual > 0.9) {
          // NSFW: Direct generation with GetImg, no threads, no assistant
          try {
            const result = await withChatAction( this.bot, this.user.chatId, 'upload_photo', () => generateImageWithFallback({ prompt, tier: 'normal' }) );
            // Send image and save to DB (no threadId)
            const actualTier = result.actualTier;
            await sendGeneratedImage({ prompt, user: this.user, bot: this.bot, result, tier: actualTier });
          } catch (error) {
            console.error('Error generating NSFW image:', error);
            await sendMessage({ text: this.dict.getString('IMAGE_GENERATION_ERROR'), user: this.user, bot: this.bot });
          }
          return;
        }

        // Not NSFW: Use assistant flow with threads and Claude
        this.assistant().callback();
      },
    }
  }

  search() {
    return {
      action: async () => {

      },
      callback: async () => {}
    }
  }

  imageRetry() {
    return {
      action: async () => {
        // This should not be called directly as an action
        await sendMessage({ text: this.dict.getString('NOT_FOUND'), user: this.user, bot: this.bot }) 
      },
      callback: async () => {
        if( await isImageLimit(this.user) ){
          await sendMessage({ text: this.dict.getString('SETTINGS_IMAGE_LIMIT_EXCEEDED', { limit: await getPeriodImageLimit(this.user) } ), user: this.user, bot: this.bot });
          return;
        }
  
        try {
          const imageId = this.data.id;
          
          if (!imageId) {
            await sendMessage({
              text: 'Image ID is missing. Please try generating a new image.',
              user: this.user,
              bot: this.bot
            });
            return;
          }
          
          // Import regenerateImage function
          
          // Regenerate the image
          await regenerateImage(imageId, this.user, this.bot);
        } catch (error) {
          console.error('Error handling image retry:', error);
          await sendMessage({
            text: 'Sorry, there was an error regenerating the image. Please try again later.',
            user: this.user,
            bot: this.bot
          });
        }
      },
    };
  }

  admin() {
    return {
      action: async () => {
        await tmplAdmin(this.user, this.bot)
      },
      callback: async () => {
        if(this.data.v === 'notifications') {
          await this.notifications().action();
        }

        if(this.data.v === 'adminUploadFile') {
          await this.adminUploadFile().action()
        }
      },
    }
  }

  notFound() {
    return {
      action: async () => {
        await sendMessage({ text: this.dict.getString('NOT_FOUND'), user: this.user, bot: this.bot })
      },
      callback: async () => {
        await sendMessage({ text: this.dict.getString('NOT_FOUND'), user: this.user, bot: this.bot })
      },
    }
  }

  pm() {
    return {
      action: async () => {
        if (!isAdmin(this.user)) return;
  
        const params = this.msg.text.split(' ');
        if (params.length < 3) {
          await sendMessage({ 
            text: 'Error: Invalid format. Use /pm [chatId] [message]', 
            user: this.user, 
            bot: this.bot 
          });
          return;
        }
  
        const chatId = params[1];
        const message = params.slice(2).join(' ');
  
        try {
          await this.bot.sendMessage(chatId, message);
          await sendMessage({
            text: `Message sent successfully to ${chatId}`,
            user: this.user,
            bot: this.bot
          });
        } catch (error) {
          await sendMessage({
            text: `Error sending message: ${error.message}`,
            user: this.user,
            bot: this.bot
          });
        }
      },
      callback: async () => {}
    }
  }

  stat() {
    return {
      action: async () => {
        if (!isAdmin(this.user)) {
          await sendMessage({ text: 'Access denied', user: this.user, bot: this.bot });
          return;
        }
  
        // Set step to wait for username input
        this.user = await userController.addStep(this.user, 'stat');
        await sendMessage({
          text: 'Enter username to analyze (without @) or type "all" for all users (last 10 days):',
          user: this.user,
          bot: this.bot,
        });
      },
      callback: async () => {
        if (!isAdmin(this.user)) {
          await sendMessage({ text: 'Access denied', user: this.user, bot: this.bot });
          return;
        }
  
        const input = this.msg.text
        if (!input) {
          await sendMessage({
            text: 'Please enter a valid username or "all"',
            user: this.user,
            bot: this.bot,
          });
          return;
        }
  
        try {          
          // Generate stats for the user or all users
          const result = await generateUserStats(input);
          
          if (result.success) {
            if (input === 'all') {
              await sendMessage({
                text: `✅ All users stats generated successfully!\n\n📊 Last 10 days data\nTotal entries: ${result.totalEntries}\nFile saved to: ${result.filePath}`,
                user: this.user,
                bot: this.bot,
              });
            } else {
              await sendMessage({
                text: `✅ Stats generated successfully!\n\nUser: @${input}\nTotal entries: ${result.totalEntries}\nFile saved to: ${result.filePath}`,
                user: this.user,
                bot: this.bot,
              });
            }
          } else {
            await sendMessage({
              text: `❌ ${result.error}`,
              user: this.user,
              bot: this.bot,
            });
          }
          
          // Reset step
          this.user = await userController.addStep(this.user, 'assistant');
        } catch (error) {
          console.error('Error generating stats:', error);
          await sendMessage({
            text: 'Error generating stats. Please try again.',
            user: this.user,
            bot: this.bot,
          });
        }
      },
    };
  }

  notifications() {
    return {
      action: async () => {
        if (!isAdmin(this.user)) return;
        this.user = await userController.addStep(this.user, 'notificationsText');
        await sendMessage({
          text: "Отправьте текст или фото с подписью для рассылки всем пользователям:",
          user: this.user,
          bot: this.bot,
        });
      },
      callback: async () => {
      },
    }
  }

  adminUploadFile() {
    return {
      action: async () => {
        if (!isAdmin(this.user)) return;
        this.user = await userController.addStep(this.user, 'adminUploadFile');
        await sendMessage({
          text: "Отправьте файл",
          user: this.user,
          bot: this.bot,
        });
      },
      callback: async () => {
        if( this.msg.document && this.msg.document.file_id ){
          await sendMessage({
            text: this.msg.document.file_id,
            user: this.user,
            bot: this.bot,
          });
          this.resetUser()
        } else {
          await sendMessage({
            text: 'No document found in your message',
            user: this.user,
            bot: this.bot,
          })
        }
      }
    }
  }

  notificationsText() {
    return {
      action: async () => { },
      callback: async () => {
        if (!isAdmin(this.user)) return;

        // Check if message has photo
        let photoId: string | undefined;
        let notificationText: string;

        if (this.msg.photo && this.msg.photo.length > 0) {
          // Get the largest photo (last in array)
          photoId = this.msg.photo[this.msg.photo.length - 1].file_id;
          notificationText = this.msg.caption || '';
        } else {
          notificationText = this.msg.text || '';
        }
        
        // Check if notification has content
        if (!notificationText.trim() && !photoId) {
          await sendMessage({
            text: 'Отправьте текст или фото с подписью для рассылки:',
            user: this.user,
            bot: this.bot,
          });
          return;
        }

        // Confirm receipt of notification text and inform about sending process
        await sendMessage({
          text: "Идет отправка ...",
          user: this.user,
          bot: this.bot,
        });
        
        // Send notifications using the controller
        await sendNotification(notificationText, this.user, this.bot, photoId);
                
        // Reset the step
        this.user = await userController.addStep(this.user, 'assistant');
      }
    }
  }

  updateUserSchema(){
    return {
      action: async () => {
        console.log('updateUserSchema')
        await updateUserSchema()
      },
      callback: async () => {
      },
    }
  }

}