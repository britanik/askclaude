import * as mongoose from 'mongoose'
import moment from 'moment'
import { IThread } from '../interfaces/threads'

// Define a schema
const Schema = mongoose.Schema

const ThreadSchema = new Schema<IThread>({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  assistantType: { type: String, enum: ['normal', 'finance', 'websearch', 'image'], default: 'normal' },
  created: { type: Date, default: () => moment().utc() },
  parent: {
    thread: { type: Schema.Types.ObjectId, ref: 'Thread' },
    point: { type: Schema.Types.ObjectId, ref: 'Message' }  // branch point message
  }
})

// Index for finding child threads of a parent
ThreadSchema.index({ 'parent.thread': 1 })

export default mongoose.model('Thread', ThreadSchema)