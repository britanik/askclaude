import * as mongoose from 'mongoose'
import moment from 'moment'
import { IAccount } from '../interfaces/accounts'

// Define schema
const Schema = mongoose.Schema

const AccountSchema = new Schema<IAccount>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  type: { 
    type: String, 
    required: true,
    enum: ['bank', 'cash', 'crypto'
    ]
  },
  currency: { type: String, required: true },
  balance: { type: Number, default: 0 },
  created: { type: Date, default: () => moment().utc() },
  isDefault: { type: Boolean, default: false }
})

// Add indexes for faster queries
AccountSchema.index({ user: 1, isActive: 1 })
AccountSchema.index({ user: 1, currency: 1 })

export default mongoose.model('Account', AccountSchema)