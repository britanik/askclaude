import * as mongoose from 'mongoose'
import moment from 'moment'
import { IPackage } from '../interfaces/packages'

const Schema = mongoose.Schema

const PackageSchema = new Schema<IPackage>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: String, enum: ['24h', '7d'], required: true },
  endDate: { type: Date, required: true },
  tokenLimit: { type: Number, required: true },
  transactionId: { type: Number, required: true },
  amount: { type: Number, required: true },
  created: { type: Date, default: () => moment().utc() }
})

export default mongoose.model('Package', PackageSchema)
