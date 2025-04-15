import { IUser } from "../interfaces/users";
import Usage from '../models/usage';

export function getStep( user:IUser ):string {
  return user.step
}

export async function getTokenUsage(user: IUser) {
  try {
    // Get all usage records for this user
    const Usage = require('../models/usage').default;
    
    // Aggregate token usage
    const result = await Usage.aggregate([
      { $match: { user: user._id } },
      { $group: {
        _id: '$type',
        total: { $sum: '$amount' }
      }}
    ]);
    
    // Extract values from result
    const usage = {
      prompt: 0,
      completion: 0,
      total: 0,
      limit: user.prefs.token_balance || 0
    };
    
    // Process each type and accumulate totals
    result.forEach(record => {
      if (record._id === 'prompt') {
        usage.prompt = record.total;
      } else if (record._id === 'completion') {
        usage.completion = record.total;
      }
    });
    
    // Calculate total
    usage.total = usage.prompt + usage.completion;
    
    return usage;
    
  } catch (e) {
    console.error('Error calculating token usage:', e);
    return {
      total: 0,
      prompt: 0,
      completion: 0,
      limit: user.prefs.token_balance || 0
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