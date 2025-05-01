import { IUser } from '../interfaces/users'

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
        rus: () => `Лимит токенов`,
        eng: () => `Token limit`
      },
      SETTINGS_USAGE_ADVICE: {
        rus: () => `Для экономии токенов создавайте /new чат каждый раз как меняете тему разговора`,
        eng: () => `To save tokens, create a /new chat each time you change the topic of conversation.`
      },
      SETTINGS_USAGE_REFS: {
        rus: () => `Чтобы увеличить лимит токенов в час - пригласите друзей /invite`,
        eng: () => `To increase your hourly token limit - invite friends /invite`
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
      SETTINGS_HOUR_LIMIT_EXCEEDED: {
        rus: () => `Лимит токенов в час исчерпан. Вы можете продолжить через {minutes} мин.`,
        eng: () => `You have reached the hourly token limit. The limit will reset in`
      },
      SETTINGS_HOUR_LIMIT_REFRESH_IN: {
        rus: () => `Обновится через {minutes} мин.`,
        eng: () => `Refresh in {minutes} min.`
      },
      ENTER_CODE: {
        rus: () => `<strong>Введите код</strong> полученный в приглашении (или /new чтобы пропустить):`,
        eng: () => `<strong>Enter the code</strong> received in the invitation (or /new to skip):`
      },
      IMAGE_ASK_PROMPT: {
        rus: () => `Опишите изображение:`,
        eng: () => `Describe the image:`
      },
      IMAGE_ASK_PROMPT_VALIDATE_ERROR: {
        rus: () => `Пожалуйста, введите текст`,
        eng: () => `Please enter text`
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
        rus: () => `🎁 Пригласить`,
        eng: () => `🎁 Invite`
      },
      NOT_FOUND: {
        rus: () => `Извините, произошла ошибка. Попробуйте начать заново /start или начните новый диалогк /new`,
        eng: () => `Sorry, an error occurred. Try to start over /start or start a new dialog /new`
      },
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
