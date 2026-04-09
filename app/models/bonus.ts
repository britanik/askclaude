import * as mongoose from 'mongoose';
import moment from 'moment';
import { IBonus } from '../interfaces/bonus';

const Schema = mongoose.Schema;

const BonusSchema = new Schema<IBonus>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['story', 'promo'], required: true },
  amount: { type: Number, required: true },
  source: { type: String, required: true },
  description: { type: String, default: null },
  expiresAt: { type: Date, default: null },
  created: { type: Date, default: () => moment().utc() }
});

BonusSchema.index({ user: 1, type: 1, source: 1 }, { unique: true });

export default mongoose.model<IBonus>('Bonus', BonusSchema);
