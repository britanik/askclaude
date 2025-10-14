import { Document, Types } from "mongoose"
import { IUser } from "./users"

export interface ITransaction extends Document {
  _id: Types.ObjectId
  ID: number
  user: IUser | Types.ObjectId
  type: 'income' | 'expense' | 'transfer'
  amount: number
  currency: string
  date: Date
  description: string
  created: Date
}