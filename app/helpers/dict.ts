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
        rus: () => `Please select your language`,
        eng: () => `Please select your language`
      },
      ASSISTANT_START: {
        rus: () => `Привет!`,
        eng: () => `Hey!`
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
