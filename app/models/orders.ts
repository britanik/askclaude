import * as mongoose from 'mongoose'
import moment from 'moment'
import { IOrder } from '../interfaces/orders'

const Schema = mongoose.Schema

const OrderSchema = new Schema<IOrder>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: String, enum: ['24h', '7d'], required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  transactionId: { type: Number, required: true },
  amount: { type: Number, required: true },
  created: { type: Date, default: () => moment().utc() }
})

export default mongoose.model('Order', OrderSchema)
