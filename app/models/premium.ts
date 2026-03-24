import * as mongoose from 'mongoose'
import moment from 'moment'
import { IPremium } from '../interfaces/premium'

const Schema = mongoose.Schema

const PremiumSchema = new Schema<IPremium>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: String, enum: ['24h', '7d'], required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  transactionId: { type: Number, required: true },
  amount: { type: Number, required: true },
  created: { type: Date, default: () => moment().utc() }
})

export default mongoose.model('Premium', PremiumSchema)
