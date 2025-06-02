import * as mongoose from 'mongoose'
import moment from 'moment'
import { IUsage } from '../interfaces/usage'

// Define schema
const Schema = mongoose.Schema

const UsageSchema = new Schema<IUsage>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  thread: { type: Schema.Types.ObjectId, ref: 'Thread' },
  created: { type: Date, default: () => moment().utc() },
  type: { 
    type: String, 
    required: true,
    enum: ['prompt', 'completion', 'referral_bonus', 'referral_welcome', 'admin_grant', 'web_search']
  },
  amount: { type: Number, required: true },
  modelName: { type: String },
  description: { type: String }
})

// Add indexes for faster queries
UsageSchema.index({ user: 1, created: -1 })
UsageSchema.index({ type: 1 })

export default mongoose.model('Usage', UsageSchema)