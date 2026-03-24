import { Document } from "mongoose"

export interface ISupportMessage extends Document {
  messageId: number
  chatId: number
  userChatId: number
  created: Date
}
