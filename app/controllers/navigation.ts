import TelegramBot from "node-telegram-bot-api"

import { IUser } from "../interfaces/users"
import Dict from "../helpers/dict"

import * as userController from "./users"
import { IMenuButton } from "../interfaces/menu-button"
import { isMenuClicked } from "./menu"
import { sendMessage } from "../templates/sendMessage"
import { tmplRegisterLang } from "../templates/tmplRegisterLanguage"
import { handleAssistantReply, handleUserReply, startAssistant } from "./assistants"
import { promptsDict } from "../helpers/prompts"

export interface INavigationParams {
  user?: IUser
  callbackQuery?: any
  msg?: any
  dict: Dict
  bot: TelegramBot
  mediaGroups: number[]
}

export default class Navigation {
  
  user:IUser
  data
  msg
  dict: Dict
  bot:TelegramBot
  mediaGroups
  rest

  constructor( params:INavigationParams ){
    this.user        = params.user
    this.bot         = params.bot
    this.msg         = params.msg
    this.mediaGroups = params.mediaGroups
    this.dict        = params.dict

    if( params.callbackQuery ){
      this.data = JSON.parse( params.callbackQuery.data )
    }

    this.rest = { 
      user: this.user, 
      msg: this.msg, 
      dict: this.dict,
      data: this.data, 
      bot: this.bot 
    }
  }

  async build(){
  // далее это либо
  // Menu: Мой профиль, Новая встреча, Настройки, Мои встречи
  // Ответ на просьбу ввести текст или отправить фото (step)
  // Комманда /new /my_profile /my_settings /add_bio /add_photo /active

    // if( !userController.hasBioAndPhoto(this.user) && !isRegistration((this.data)? this.data.a :) ){
    //   await this.regAskPhoto().action()
    //   return
    // }
    let method:string
    let whatIsIt:string
    let step = userController.getStep( this.user )
    
    // if this is callbackQuery (inline button)
    if( this.data && this[this.data.a] ){
      method = this.data.a
      whatIsIt = 'callback'
    }

    // if this is message
    if( this.msg ){
      let menuItem:IMenuButton | false = isMenuClicked( this.msg )
      if( menuItem ){
        
        // Menu or command
        whatIsIt = 'action'
        method = menuItem.method
        
        // Reset this.user messages, step and data properties
        await this.resetUser()

      } else {

        // Input or photo (if step) or just simple text (if no step)
        whatIsIt = 'callback'
        if( step ){
          method = step
        }
      }
    }

    if( !this[method] && this.msg ){
      // await addLog({ method: 'text', ...this.rest })
      await this.notFound().action()
      return
    }

    // if user account deleted
    // if( this.user.deleted ){
    //   if( method == 'start' && this.data.v ){
    //     await this.start().callback()
    //   } else {
    //     await this.start().action()
    //   }
    // }
    
    // if( !userController.hasBioAndPhoto(this.user) && !this[method]().registration ){
    //   await addLog({ method: 'redirectProfileNotFullуBefore', ...this.rest })
    //   this.user = await userController.addData(this.user, 'redirectTo', method)
    //   await this.settingsRedirect().action()
    //   return
    // }

    console.log('execute', method, whatIsIt)
    // execute
    await this[method]()[whatIsIt]()
  }

  async resetUser(){
    console.log('reset user')
    
    // reset messages
    for (const key in this.user.messages) {
      if (Object.prototype.hasOwnProperty.call(this.user.messages, key)) {
        this.user.messages[key] = null;
      }
    }

    // reset step and data
    this.user.step = null
    this.user.data = null
    
    // save
    this.user = await this.user.save()
  }

  start(){
    return {
      action: async () => {
        await this.language().action()
      },
      callback: async () => {},
    }
  }

  new(){
    return {
      action: async () => {
        await this.assistant().action()
      },
      callback: async () => {},
    }
  }

  language(){
    return {
      action: async () => {
        await tmplRegisterLang( this.user, this.dict, this.bot )
      },
      callback: async () => {
        this.user = await userController.updatePref( this.user, 'lang', this.data.v )
        this.dict.setLang( this.data.v )

        await this.assistant().action()
      },
    }
  }

  assistant(){
    return {
      action: async () => {
        console.log('Assistant()')
        this.user = await userController.addStep(this.user, 'assistant')
        const firstMessage = this.dict.getString('ASSISTANT_START')
        let thread = await startAssistant( this.user, firstMessage )
        await handleAssistantReply(thread, this.bot, this.dict)
      },
      callback: async () => {
        try {
          const userReply = (this.data?.v) ? this.dict.getString(this.data.v) : this.msg.text
          let threadWithUserMessage = await handleUserReply(this.user, userReply, this.bot)
          await handleAssistantReply(threadWithUserMessage, this.bot, this.dict)
        } catch(e){
          console.log('Failed to settingsAboutAssistant callback', e)
          await sendMessage({ text: this.dict.getString('ASSISTANT_ERROR'), user: this.user, bot: this.bot })
        }
      },
    }
  }

  notFound(){
    return {
      action: async () => {
        await sendMessage({ text: this.dict.getString('NOT_FOUND'), user: this.user, bot: this.bot })
      },
      callback: async () => {
        await sendMessage({ text: this.dict.getString('NOT_FOUND'), user: this.user, bot: this.bot })
      },
    }
  }

  example(){
    return {
      action: async () => {},
      callback: async () => {},
    }
  }

}