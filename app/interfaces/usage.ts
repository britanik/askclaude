import { Document, Types } from "mongoose"
import { IUser } from "./users"
import { IThread } from "./threads"

export interface IUsage extends Document {
  user: IUser | Types.ObjectId
  thread?: IThread | Types.ObjectId
  created: Date
  type: 'prompt' | 'completion' | 'referral_bonus' | 'referral_welcome' | 'admin_grant'
  amount: number
  modelName?: string
  description?: string
}