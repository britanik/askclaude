import { Document, Types } from "mongoose"
import { IUser } from "./users"
import { IMessage } from "./messages"

export interface IThreadParent {
  thread: IThread | Types.ObjectId
  point: IMessage | Types.ObjectId  // the message where branch happened
}

export interface IThread extends Document {
  _id: Types.ObjectId
  owner: IUser
  assistantType?: 'normal' | 'finance' | 'websearch'
  created?: Date
  parent?: IThreadParent  // if this thread is a branch from another thread
}