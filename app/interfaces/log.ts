import { Document } from "mongoose"
import { IUser } from "./users"

export interface ILog extends Document {
  user: IUser
  created: Date
  category: string
  name: string
  method: string,
  template: string,
  text: string,
  photoId: string,
  msg: any,
  data: any,
  prompt: string,
  response: string,
}