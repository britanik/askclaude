import { Document, Types } from "mongoose"
import { IUser } from "./users"

export interface IAccount extends Document {
  _id: Types.ObjectId
  ID: number
  user: IUser | Types.ObjectId
  name: string
  type: 'bank' | 'cash' | 'crypto'
  currency: string
  balance: number
  created: Date
  isDefault: boolean
}