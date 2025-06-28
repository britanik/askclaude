import { Document, Types } from "mongoose"

export interface IUser extends Document {
  _id: Types.ObjectId;
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
    token_balance?: number,
  },
  keys?: {
    notion?: string,
  }
}