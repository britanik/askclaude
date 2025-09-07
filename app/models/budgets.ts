import { Schema, model } from 'mongoose';
import { IBudget } from '../interfaces/budgets';

const BudgetSchema = new Schema<IBudget>({
  ID: { type: Number, unique: true, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  totalAmount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, trim: true },
  startDate: { type: Date, required: true, default: Date.now },
  endDate: { type: Date, required: true },
  created: { type: Date, default: Date.now }
});

// Index for finding active budgets by user and currency
BudgetSchema.index({ user: 1, currency: 1, isActive: 1 });

// Index for finding budgets by date range
BudgetSchema.index({ startDate: 1, endDate: 1 });

// Index for readable ID
BudgetSchema.index({ ID: 1 }, { unique: true });

export const Budget = model<IBudget>('Budget', BudgetSchema);