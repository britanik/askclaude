import { Document, Types } from "mongoose"
import { IThread } from "./threads"
import { IImage } from "./image"

export interface IMessage extends Document {
  _id: Types.ObjectId
  thread: IThread | Types.ObjectId
  role: string
  content?: string
  created: Date
  name?: string
  images?: (IImage | Types.ObjectId)[]  // References to Image documents
  mediaGroupId?: string
  telegramMessageId?: number  // Telegram message_id for reply tracking
  imageId?: Types.ObjectId    // Reference to Image document for generated images
}