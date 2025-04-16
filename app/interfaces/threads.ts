import { Document, ObjectId } from "mongoose"
import { IUser } from "./users"

export interface IThread extends Document {
  _id: ObjectId
  owner: IUser
  created?: Date
  messages?: { 
    role: string, 
    content?: string, 
    tool_calls?: [], 
    created?: Date, 
    name?: string,
    images?: string[],
    mediaGroupId?: string
  }[]
}