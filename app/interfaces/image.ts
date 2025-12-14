import { Document, Types } from "mongoose"
import { IUser } from "./users"

export type ImageProvider = 'openai' | 'getimg' | 'gemini' | 'unknown';

export interface IImage extends Document {
  user: IUser | Types.ObjectId
  prompt?: string // Optional - not set for user-uploaded images
  created: Date
  imageUrl?: string
  telegramFileId?: string
  localPath?: string
  provider: ImageProvider
  multiTurnData?: any // Provider-specific data for multi-turn editing
  threadId?: Types.ObjectId // Link to conversation thread
}