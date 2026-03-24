import * as mongoose from 'mongoose'
import { ISupportMessage } from '../interfaces/supportMessages'

const Schema = mongoose.Schema

const SupportMessageSchema = new Schema<ISupportMessage>({
  messageId: { type: Number, required: true },
  chatId: { type: Number, required: true },
  userChatId: { type: Number, required: true },
  created: { type: Date, default: () => new Date() },
})

SupportMessageSchema.index({ messageId: 1, chatId: 1 })

export default mongoose.model('SupportMessage', SupportMessageSchema)
