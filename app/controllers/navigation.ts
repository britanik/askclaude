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
      return this.data.a
    }

    if (this.msg) {
      const menuItem: IMenuButton | false = isMenuClicked(this.msg)
      if (menuItem) {
        return menuItem.method
      }

      const step = userController.getStep(this.user)
      if (step) {
        return step
      }
    }

    return null
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
      callback: async () => {},
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
        await this.assistant().action()
      },
    }
  }

  assistant() {
    return {
      action: async () => {
        console.log('Assistant()')
        this.user = await userController.addStep(this.user, 'assistant')
        const firstMessage = this.dict.getString('ASSISTANT_START')
        let thread = await startAssistant(this.user, firstMessage)
        await handleAssistantReply(thread, this.bot, this.dict)
      },
      callback: async () => {
        try {
          let text:string
          text = ( this.msg.voice ) ? await getTranscription(this.msg, this.bot) : this.msg.text
          let threadWithUserMessage = await handleUserReply(this.user, text, this.bot)
          await handleAssistantReply(threadWithUserMessage, this.bot, this.dict)
        } catch (e) {
          console.error('Failed to handle assistant callback', e)
          await sendMessage({ text: this.dict.getString('ASSISTANT_ERROR'), user: this.user, bot: this.bot })
        }
      },
    }
  }

  admin() {
    return {
      action: async () => {
        await tmplAdmin(this.user, this.bot)
      },
      callback: async () => {},
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
}