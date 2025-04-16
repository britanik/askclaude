import { IUser } from '../interfaces/users'
// import * as userController from '../controllers/users'

export default class Dict {
  private user: IUser
  private strings: any
  public lang: string

  constructor(user: IUser){
    this.user = user
    this.strings = this.getStrings()
  }

  setLang(lang: string){
    this.lang = lang
  }

  getStrings(){
    return {
      // Register
      REGISTER_LANG: {
        rus: () => `ℹ️ Please select your language`,
        eng: () => `ℹ️ Please select your language`
      },
      ASSISTANT_START: {
        rus: () => `Привет!`,
        eng: () => `Hey!`
      },
      ASSISTANT_ERROR: {
        rus: () => `Произошла ошибка`,
        eng: () => `An error occurred`
      },
      SETTINGS_TITLE: {
        rus: () => `⚙️ Настройки`,
        eng: () => `⚙️ Settings`
      },
      SETTINGS_USAGE: {
        rus: () => `Использовано токенов`,
        eng: () => `Tokens used`
      },
      SETTINGS_USAGE_ADVICE: {
        rus: () => `Для экономии токенов создавайте новый чат /new каждый раз как меняете тему разговора`,
        eng: () => `To save tokens, create a new chat (/new) each time you change the topic of conversation.`
      },
      SETTINGS_USAGE_REFS: {
        rus: () => `Чтобы пополнить баланс токенов - пригласите друзей /invite`,
        eng: () => `Topup tokens balance by inviting friends /invite`
      },
      SETTINGS_FORMATS: {
        rus: () => `Доступные форматы`,
        eng: () => `Available formats`
      },
      SETTINGS_FORMATS_STRING: {
        rus: () => `Текст, Фото, Голосовые сообщения`,
        eng: () => `Text, Photo, Voice messages`
      },
      SETTINGS_LANGUAGE: {
        rus: () => `Язык`,
        eng: () => `Language`
      },
      ENTER_CODE: {
        rus: () => `<strong>Введите код</strong> полученный в приглашении (или /new чтобы пропустить):`,
        eng: () => `<strong>Enter the code</strong> received in the invitation (or /new to skip):`
      },
      BUTTON_NEW_CHAT: {
        rus: () => `💬 Новый чат`,
        eng: () => `💬 New Chat`
      },
      BUTTON_CODE: {
        rus: () => `🤑 Ввести код`,
        eng: () => `🤑 Enter code`
      },
      BUTTON_INVITE_FRIEND: {
        rus: () => `🎁 Пригласить друга`,
        eng: () => `🎁 Invite friend`
      },
      NOT_FOUND: {
        rus: () => `Извините, произошла ошибка. Попробуйте начать заново /start или начните новый диалогк /new`,
        eng: () => `Sorry, an error occurred. Try to start over /start or start a new dialog /new`
      }
    }
  }

  getString(name: string, variables?: any) {
    try {
      if( !this.strings[name] ) console.log('STRING NOT FOUND:', name)
      let stringObj = this.strings[name];

      // default to eng
      let lang = this.lang;
      if (!stringObj[lang]) {
        lang = 'rus';
      }

      // let str = typeof stringObj[lang] === 'function' ?
      //           stringObj[lang]() : stringObj[lang][this.user.gender]()

      let str = typeof stringObj[lang] === 'function' ?
                stringObj[lang]() : stringObj[lang]['male']()

      
      // Replace variables inside the string if any
      if (variables && typeof str === 'string') {
        Object.keys(variables).forEach(key => {
          str = str.replace(new RegExp(`{${key}}`, 'g'), variables[key])
        })
      }

      return str;
    } catch (e) {
      console.log('Error in getString', e);
    }
  }
}
