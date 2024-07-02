import Dict from "../helpers/dict"
import { IUser } from "../interfaces/users"
import { sendMessage } from "./sendMessage"

export async function tmplRegisterLang( user:IUser, dict:Dict, bot ){
  let text = dict.getString('REGISTER_LANG')
  let buttons = [
    [
      { 'text': 'Eng', 'callback_data': '{"a":"language","v":"eng"}' },
      { 'text': 'Рус', 'callback_data': '{"a":"language","v":"rus"}' },
    ]
  ]

  await sendMessage({ text, user, bot, buttons })
}