import { Document, Types } from "mongoose"
import { IUser } from "./users"

export type LimitType = 'hourly_token' | 'daily_token' | 'daily_websearch' | 'daily_image'

export interface ILimit extends Document {
  user: IUser | Types.ObjectId
  type: LimitType
  usage: number      // usage amount when limit was hit
  limit: number      // the limit value that was reached
  created: Date
}