import * as mongoose from 'mongoose'
import moment from 'moment'
import { ITransaction } from '../interfaces/transactions'
import { createAutoIncrementMiddleware } from '../helpers/autoIncrement'

const Schema = mongoose.Schema

const TransactionSchema = new Schema<ITransaction>({
  ID: { type: Number, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  type: { 
    type: String, 
    required: true,
    enum: ['income', 'expense', 'transfer']
  },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  date: { type: Date, default: () => moment().utc() },
  description: { type: String, required: true },
  created: { type: Date, default: () => moment().utc() }
})

// Use the reusable auto-increment middleware
TransactionSchema.pre('save', createAutoIncrementMiddleware('Transaction'))

// Add indexes for faster queries
TransactionSchema.index({ user: 1, date: -1 })
TransactionSchema.index({ user: 1, type: 1, date: -1 })
TransactionSchema.index({ account: 1, date: -1 })
TransactionSchema.index({ ID: 1 }, { unique: true, sparse: true })

export default mongoose.model('Transaction', TransactionSchema)