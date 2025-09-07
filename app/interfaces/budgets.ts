import { Document, Types } from 'mongoose';
import { IUser } from './users'

export interface IBudget extends Document {
  _id: Types.ObjectId;
  ID: number;
  user: IUser | Types.ObjectId;
  totalAmount: number;
  currency: string;
  startDate: Date;
  endDate: Date;
  created: Date;
}