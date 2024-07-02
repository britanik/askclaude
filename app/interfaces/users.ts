import { Document } from "mongoose"


export interface IUser extends Document {
  ID: number;
  name: string;
  username: string,
  blocked: boolean,
  step: string,
  chatId: number,
  created: Date,
  messages: Object,
  data: Object,
  prefs: {
    lang: 'eng' | 'rus',
  }
}