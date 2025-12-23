import { Document, Types } from "mongoose"

export interface IOrder extends Document {
  _id: Types.ObjectId
  user: Types.ObjectId
  plan: '24h' | '7d'
  startDate: Date
  endDate: Date
  transactionId: number
  amount: number
  created: Date
}
