import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

export function generatePaymentToken(userId: Types.ObjectId): string {
  return jwt.sign(
    { userId: userId.toString() },
    process.env.PAYMENT_SECRET,
    { expiresIn: '24h' }
  );
}

export function verifyPaymentToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, process.env.PAYMENT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}
