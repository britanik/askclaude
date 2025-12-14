import * as mongoose from 'mongoose'
import moment from 'moment'
import { IMessage } from '../interfaces/messages'

// Define a schema
const Schema = mongoose.Schema

const MessageSchema = new Schema<IMessage>({
  thread: { type: Schema.Types.ObjectId, ref: 'Thread', required: true },
  role: { type: String, required: true },
  content: { type: String },
  created: { type: Date, default: () => moment().utc() },
  name: { type: String, default: undefined },
  images: { type: [{ type: Schema.Types.ObjectId, ref: 'Image' }], default: undefined },
  mediaGroupId: { type: String, default: undefined },
  telegramMessageId: { type: Number, default: undefined },
  imageId: { type: Schema.Types.ObjectId, ref: 'Image', default: undefined }
})

// Add indexes for faster queries
MessageSchema.index({ thread: 1, created: 1 })
MessageSchema.index({ role: 1 })
MessageSchema.index({ telegramMessageId: 1 })  // For finding messages by Telegram message ID

export default mongoose.model<IMessage>('Message', MessageSchema)