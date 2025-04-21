import { Document, Types } from "mongoose"
import { IUser } from "./users"

export interface IImage extends Document {
  user: IUser | Types.ObjectId
  prompt: string
  created: Date
  imageUrl?: string
  telegramFileId?: string
  localPath?: string
}