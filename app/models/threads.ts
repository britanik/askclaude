import * as mongoose from 'mongoose'
import moment from 'moment'
import { IThread } from '../interfaces/threads'

// Define a schema
const Schema = mongoose.Schema

const ThreadSchema = new Schema<IThread>({
  _id: { type: String, default: () => new mongoose.Types.ObjectId() },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  created: { type: Date, default: () => moment().utc() }
})

export default mongoose.model('Thread', ThreadSchema)