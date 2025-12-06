import * as mongoose from 'mongoose'
import moment from 'moment'
import { ILimit } from '../interfaces/limits'

const Schema = mongoose.Schema

const LimitSchema = new Schema<ILimit>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    required: true,
    enum: ['hourly_token', 'daily_token', 'daily_websearch', 'daily_image']
  },
  usage: { type: Number, required: true },
  limit: { type: Number, required: true },
  created: { type: Date, default: () => moment().utc() }
})

// Indexes for faster queries
LimitSchema.index({ user: 1, created: -1 })
LimitSchema.index({ type: 1, created: -1 })
LimitSchema.index({ user: 1, type: 1, created: -1 })

export default mongoose.model<ILimit>('Limit', LimitSchema)