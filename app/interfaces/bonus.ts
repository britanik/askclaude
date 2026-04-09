import { ObjectId } from 'mongoose';

export interface IBonus {
  user: ObjectId;
  type: 'story' | 'promo';
  amount: number;
  source: string;
  description?: string;
  expiresAt?: Date;
  created: Date;
}
