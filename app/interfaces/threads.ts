import { Document, ObjectId } from "mongoose"
import { IUser } from "./users"

export interface IThread extends Document {
  _id: ObjectId
  owner: IUser
  webSearch?: boolean
  assistantType?: 'normal' | 'finance'
  created?: Date
}