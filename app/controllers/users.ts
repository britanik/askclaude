import { IUser } from "../interfaces/users";
import Thread from '../models/threads';
import moment from 'moment';

export function getStep( user:IUser ):string {
  return user.step
}

export async function getTokenUsage(user: IUser) {
  try {
    // Get all threads for this user
    const allThreads = await Thread.find({ owner: user._id });
    
    // Get current month threads
    const currentMonthStart = moment().startOf('month');
    const currentMonthThreads = await Thread.find({ 
      owner: user._id,
      created: { $gte: currentMonthStart.toDate() }
    });
    
    // Calculate totals
    const totalTokens = allThreads.reduce((sum, thread) => {
      return sum + (thread.tokens?.total || 0);
    }, 0);
    
    const monthlyTokens = currentMonthThreads.reduce((sum, thread) => {
      return sum + (thread.tokens?.total || 0);
    }, 0);
    
    const monthlyLimit = parseInt(process.env.MONTHLY_TOKEN_LIMIT);

    return {
      total: totalTokens,
      monthly: monthlyTokens,
      limit: monthlyLimit
    };
  } catch (e) {
    console.error('Error calculating token usage:', e);
    return {
      total: 0,
      monthly: 0,
      limit: process.env.MONTHLY_TOKEN_LIMIT
    };
  }
}

export function getMessage( user:IUser, name:string ){
  if( user.messages[name] ){
    return user.messages[name]
  } else {
    return false
  }
}

export async function updateMessage(user, name: string, messageId: number | number[] | null) {
  user.messages[name] = messageId;
  return await user.save();
}

export async function blocked( user:IUser ){
  user.blocked = true
  return await user.save()
}

export async function updatePref(user:IUser, pref:string, val) {
  try {
    user.prefs[pref] = val
    return await user.save()
  } catch(err) { console.log(err) }
}

export async function addStep( user, step ):Promise<IUser>{
  user.step = step
  return await user.save()
}