import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

export type PaymentPlan = '24h' | '7d';

export function generatePaymentToken(userId: Types.ObjectId, plan: PaymentPlan): string {
  return jwt.sign(
    { userId: userId.toString(), plan },
    process.env.PAYMENT_SECRET,
    { expiresIn: '24h' }
  );
}

export function verifyPaymentToken(token: string): { userId: string, plan: PaymentPlan } | null {
  try {
    return jwt.verify(token, process.env.PAYMENT_SECRET) as { userId: string, plan: PaymentPlan };
  } catch {
    return null;
  }
}
