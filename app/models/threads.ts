import * as mongoose from 'mongoose'
import moment from 'moment';
import { IThread } from '../interfaces/threads';

// Define a schema
const Schema = mongoose.Schema;

const ThreadSchema = new Schema<IThread>({
  owner: { type: Schema.Types.ObjectId, ref: 'User' },
  created: { type: Date, default: () => moment().utc() },
  messages: [{ 
    "role": String, 
    "content": String,
    "tool_calls": { type: Array, default: undefined },
    "created": { type: Date, default: () => moment().utc() },
    "name": { type: String, default: undefined },
    "images": { type: [String], default: undefined },
    "mediaGroupId": { type: String, default: undefined } // Add this field
  }],
})

export default mongoose.model('Thread', ThreadSchema);