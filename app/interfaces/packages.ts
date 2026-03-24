import { Document, Types } from "mongoose"

export interface IPackage extends Document {
  _id: Types.ObjectId
  user: Types.ObjectId
  endDate: Date
  tokenLimit: number
  tokensUsed: number
  transactionId: number
  amount: number
  created: Date
}
