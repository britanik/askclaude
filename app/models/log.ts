import * as mongoose from 'mongoose'
import { ILog } from '../interfaces/log';
import moment from 'moment';

// Define a schema
const Schema = mongoose.Schema;

const LogSchema = new Schema<ILog>({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  created: { type: Date, default: () => moment().utc() },
  msg: { type: {} },
  data: { type: {} },
  category: { type: String }, // chatgpt
  name: { type: String },
  method: { type: String },
  template: { type: String },
  text: { type: String },
  photoId: { type: String },
  prompt: { type: String },
  response: { type: String },
})

export default mongoose.model('Log', LogSchema);