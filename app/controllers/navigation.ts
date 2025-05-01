import TelegramBot from "node-telegram-bot-api"
import { IUser } from "../interfaces/users"
import Dict from "../helpers/dict"
import * as userController from "./users"
import { IMenuButton } from "../interfaces/menu-button"
import { isMenuClicked } from "./menu"
import { sendMessage } from "../templates/sendMessage"
import { tmplRegisterLang } from "../templates/tmplRegisterLanguage"
import { handleAssistantReply, handleUserReply, startAssistant } from "./assistants"
import { tmplAdmin } from "../templates/tmplAdmin"
import { getTranscription } from "../services/ai"
import { isAdmin } from "../helpers/helpers"

import { tmplSettings } from '../templates/tmplSettings'
import { tmplInvite } from "../templates/tmplInvite"
import { getMinutesToNextHour, isTokenLimit, updateUserSchema } from "./tokens"
import { isValidInviteCode, processReferral } from "./invites"
import { sendNotificationToAllUsers } from "./notifications"
import { generateOpenAIImage } from "./images"
import { IThread } from "../interfaces/threads"

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
        // Check token limit
        if( await isTokenLimit(this.user) ){
          await sendMessage({ text: this.dict.getString('SETTINGS_HOUR_LIMIT_EXCEEDED', { minutes: getMinutesToNextHour() }), user: this.user, bot: this.bot });
          return;
        }

        this.user = await userController.addStep(this.user, 'assistant')
        let thread:IThread = await startAssistant(this.user, this.dict.getString('ASSISTANT_START'))
        await handleAssistantReply(thread, this.bot, this.dict)
      },
      callback: async () => {
        // Check token limit
        if( await isTokenLimit(this.user) ){
          await sendMessage({ text: this.dict.getString('SETTINGS_HOUR_LIMIT_EXCEEDED', { minutes: getMinutesToNextHour() }), user: this.user, bot: this.bot });
          return;
        }

        try {
          let text: string = '';
          let images: string[] = [];
          let mediaGroupId = this.msg.media_group_id || null;
          
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
            
            console.log('Received image:', photoId);
          }

          // Handle regular text messages
          else {
            text = this.msg.text;
          }
          
          // For media groups, wait before processing to collect all images
          if (mediaGroupId) {
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
              await handleUserReply(this.user, text, this.bot, images, mediaGroupId);
              return; // Important: don't process this as a full message
            }
          }
          
          // Now process the message normally
          let threadWithUserMessage = await handleUserReply(this.user, text, this.bot, images, mediaGroupId);
          
          // Only send to Claude if this isn't a media group or it's the first message after waiting
          if (!mediaGroupId || this.mediaGroups.includes(mediaGroupId)) {
            await handleAssistantReply(threadWithUserMessage, this.bot, this.dict);
            
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

  imageAskPrompt() {
    return {
      action: async () => {
        this.user = await userController.addStep(this.user, 'imageAskPrompt');

        // send message to user
        await sendMessage({ text: this.dict.getString('IMAGE_ASK_PROMPT'), user: this.user, bot: this.bot, });
      },
      callback: async () => {
        let prompt = this.msg.text
        if (!prompt || prompt.trim() === '') {
          await sendMessage({ text: this.dict.getString('IMAGE_ASK_PROMPT_VALIDATE_ERROR'), user: this.user, bot: this.bot, });
          return;
        }

        await generateOpenAIImage(prompt, this.user, this.bot);
      },
    }
  }

  imageRetry() {
    return {
      action: async () => {
        // This should not be called directly as an action
        await sendMessage({
          text: this.dict.getString('NOT_FOUND'),
          user: this.user,
          bot: this.bot
        });
      },
      callback: async () => {
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
          const { regenerateImage } = require('../controllers/images');
          
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

  notifications() {
    return {
      action: async () => {
        if (!isAdmin(this.user)) return;
        this.user = await userController.addStep(this.user, 'notificationsText');
        await sendMessage({
          text: "Введите текст уведомления для всех пользователей:",
          user: this.user,
          bot: this.bot,
        });
      },
      callback: async () => {
      },
    }
  }

  notificationsText() {
    return {
      action: async () => { },
      callback: async () => {
        if (!isAdmin(this.user)) return;
        
        const notificationText = this.msg.text;
        
        // Check if notification text is valid
        if (!notificationText || notificationText.trim() === '') {
          await sendMessage({
            text: 'Текст уведомления не может быть пустым. Попробуйте снова:',
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
        const results = await sendNotificationToAllUsers(notificationText, this.bot, this.user);
        
        // Send statistics back to admin
        const statsMessage = `Результаты:
Успешно: ${results.success}
Ошибки: ${results.failed}
Всего пользователей: ${results.total}`;
        
        await sendMessage({
          text: statsMessage,
          user: this.user,
          bot: this.bot,
        });
        
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