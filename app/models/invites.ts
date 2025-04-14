import * as mongoose from 'mongoose'
import moment from 'moment';
import { IUser } from '../interfaces/users';

// Interface for Invite
export interface IInvite extends mongoose.Document {
  code: string;
  owner: IUser;
  usedBy: IUser[];
  created: Date;
  expires?: Date;
}

// Define a schema
const Schema = mongoose.Schema;

const InviteSchema = new Schema<IInvite>({
  code: { type: String, required: true, unique: true },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  usedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  created: { type: Date, default: () => moment().utc() },
  expires: { type: Date, default: null }
});

export default mongoose.model('Invite', InviteSchema);