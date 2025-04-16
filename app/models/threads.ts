import * as mongoose from 'mongoose'
import moment from 'moment';
import { IThread } from '../interfaces/threads';

// Define a schema
const Schema = mongoose.Schema;

const ThreadSchema = new Schema<IThread>({
  _id: { type: String, default: () => new mongoose.Types.ObjectId() },
  owner: { type: Schema.Types.ObjectId, ref: 'User' },
  created: { type: Date, default: () => moment().utc() },
  messages: [{ 
    "role": String, 
    "content": String,
    "tool_calls": { type: Array, default: undefined },
    "created": { type: Date, default: () => moment().utc() },
    "name": { type: String, default: undefined },
    "images": { type: [String], default: undefined },
    "mediaGroupId": { type: String, default: undefined }
  }]
})

export default mongoose.model('Thread', ThreadSchema);