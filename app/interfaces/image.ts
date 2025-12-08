import { Document, Types } from "mongoose"
import { IUser } from "./users"

export type ImageProvider = 'openai' | 'getimg' | 'unknown';

export interface IImage extends Document {
  user: IUser | Types.ObjectId
  prompt: string
  created: Date
  imageUrl?: string
  telegramFileId?: string
  localPath?: string
  provider: ImageProvider
  openaiResponseId?: string // For multi-turn image editing (OpenAI Responses API)
  threadId?: Types.ObjectId // Link to conversation thread (for image assistant)
}