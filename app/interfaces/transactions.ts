import { Document, Types } from "mongoose"
import { IUser } from "./users"
import { IAccount } from "./accounts"

export interface ITransaction extends Document {
  _id: Types.ObjectId
  ID: number
  user: IUser | Types.ObjectId
  account: IAccount | Types.ObjectId
  type: 'income' | 'expense' | 'transfer'
  amount: number
  currency: string
  date: Date
  description: string
  created: Date
}