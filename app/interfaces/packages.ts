import { Document, Types } from "mongoose"

export interface IPackage extends Document {
  _id: Types.ObjectId
  user: Types.ObjectId
  plan: '24h' | '7d'
  endDate: Date
  tokenLimit: number
  transactionId: number
  amount: number
  created: Date
}
