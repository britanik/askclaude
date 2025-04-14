import * as mongoose from 'mongoose'
import moment from 'moment'
import { IUser } from '../interfaces/users'

mongoose.set('strictQuery', true)

// Define a schema
const Schema = mongoose.Schema;

const UserSchema = new Schema<IUser>({
  ID: { type: Number },
  name: { type: String, trim: true, required: true },
  username: { type: String },
  blocked: { type: Boolean, default: false },
  step: { type: String, default: '' },
  chatId: { type: Number, default: 0 },
  created: { type: Date, default: () => moment().utc() },
  messages: { type: Object, default: {} },
  data: { type: Object, default: {} },
  prefs: {
    lang: { type: String },
    token_balance: { type: Number }
  }
})

export default mongoose.model('User', UserSchema);