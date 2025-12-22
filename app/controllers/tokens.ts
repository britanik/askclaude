import moment from 'moment';
import TelegramBot from 'node-telegram-bot-api';
import { IUser } from '../interfaces/users';
import { LimitType } from '../interfaces/limits';
import User from '../models/users';
import Usage from '../models/usage';
import Invite from '../models/invites';
import Limit from '../models/limits';
import { isAdmin } from '../helpers/helpers';

// Update user schema to remove token_balance field
export async function updateUserSchema() {
  try {
    // Remove token_balance field from all users
    const result = await User.updateMany(
      { 'prefs.token_balance': { $exists: true } },
      { $unset: { 'prefs.token_balance': "" } }
    );
    
    console.log(`Updated ${result.modifiedCount} users to remove token_balance field`);
  } catch (error) {
    console.error('Error updating user schema:', error);
  }
}

// Check if user is at the hourly limit
export async function isTokenLimit(user: IUser) {
  try {
    const hourlyUsage: number = await getPeriodTokenUsage(user);
    const hourlyLimit = await getPeriodTokenLimit(user);
    
    // Check daily limit as well
    const dailyUsage: number = await getDailyTokenUsage(user);
    const dailyLimit = await getDailyTokenLimit(user);
    
    const hourlyExceeded = hourlyUsage >= hourlyLimit;
    const dailyExceeded = dailyUsage >= dailyLimit;

    // console.log('hourlyExceeded:', hourlyExceeded)
    // console.log('dailyExceeded: ', dailyExceeded)
    
    if (hourlyExceeded) {
      await logLimitHit(user, 'hourly_token', hourlyUsage, hourlyLimit);
    }
    
    if (dailyExceeded) {
      await logLimitHit(user, 'daily_token', dailyUsage, dailyLimit);
    }
        
    if (hourlyExceeded || dailyExceeded) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking token limit:', error);
    return false;
  }
}

// Check which limit was reached and return appropriate message
export async function getTokenLimitMessage(user: IUser): Promise<string> {
  try {
    const hourlyUsage: number = await getPeriodTokenUsage(user);
    const hourlyLimit = await getPeriodTokenLimit(user);
    const dailyUsage: number = await getDailyTokenUsage(user);
    const dailyLimit = await getDailyTokenLimit(user);
    
    const hourlyExceeded = hourlyUsage >= hourlyLimit;
    const dailyExceeded = dailyUsage >= dailyLimit;
    
    if (hourlyExceeded && dailyExceeded) {
      return `Достигнуты лимиты токенов в час и в день. Обновится через ${getMinutesToNextHour()} мин. (час) и через ${getTimeToNextDay()} (день).`;
    } else if (hourlyExceeded) {
      return `Лимит токенов в час исчерпан. Вы можете продолжить через ${getMinutesToNextHour()} мин.`;
    } else if (dailyExceeded) {
      return `Лимит токенов в день исчерпан. Вы можете продолжить через ${getTimeToNextDay()}.`;
    }
    
    return 'Лимит токенов исчерпан.'; // Fallback
  } catch (error) {
    console.error('Error getting token limit message:', error);
    return 'Лимит токенов исчерпан.';
  }
}

// Check if user is at the web search limit (DAILY)
export async function isWebSearchLimit(user: IUser):Promise<boolean> {
  try {
    const usage: number = await getDailyWebSearchUsage(user);
    const dailyLimit = await getDailyWebSearchLimit(user);
    
    if (usage >= dailyLimit) {
      await logLimitHit(user, 'daily_websearch', usage, dailyLimit);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking web search limit:', error);
    return false;
  }
}

// Calculate minutes until the next hour
export function getMinutesToNextHour() {
  const now = new Date();
  const nextHour = new Date();
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
  
  const diffMs = nextHour.getTime() - now.getTime();
  const minutesLeft = Math.ceil(diffMs / (1000 * 60));
  
  return minutesLeft;
}

// Calculate time until tomorrow (for daily limits) - returns formatted string
export function getTimeToNextDay(): string {
  const now = moment();
  const tomorrow = moment().add(1, 'day').startOf('day');
  const duration = moment.duration(tomorrow.diff(now));
  
  const hours = Math.floor(duration.asHours());
  const minutes = duration.minutes();
  
  if (hours > 0) {
    return `${hours} ч. ${minutes} мин.`;
  } else {
    return `${minutes} мин.`;
  }
}

// Calculate minutes until tomorrow (for daily limits) - for backward compatibility
export function getMinutesToNextDay() {
  const now = moment();
  const tomorrow = moment().add(1, 'day').startOf('day');
  return tomorrow.diff(now, 'minutes');
}

// Calculate period token limit including friend bonuses (HOURLY)
export async function getPeriodTokenLimit(user: IUser): Promise<number> {
  try {
    // Get base limit from env - use admin limit if user is admin
    let baseLimit: number;
    baseLimit = (isAdmin(user)) ? +process.env.TOKENS_HOUR_LIMIT_ADMIN : +process.env.TOKENS_HOUR_LIMIT

    // Find user's invite code
    const invite = await Invite.findOne({ owner: user._id });

    // Calculate bonus based on referrals
    let referralBonus = 0;
    if (invite) {
      // Each used invite adds TOKENS_PER_REFERRAL to the limit
      const usedInvitesCount = invite.usedBy.length;
      const bonusPerReferral = isAdmin(user) ? +process.env.TOKENS_PER_REFERRAL_ADMIN : +process.env.TOKENS_PER_REFERRAL;
      referralBonus = usedInvitesCount * bonusPerReferral;
    }

    // Return the total limit
    return baseLimit + referralBonus;
  } catch (error) {
    console.error('Error calculating period token limit:', error);
    // Return default limit in case of error
    return +(process.env.TOKENS_HOUR_LIMIT || 10000);
  }
}

// Calculate daily token limit including friend bonuses (NEW)
export async function getDailyTokenLimit(user: IUser): Promise<number> {
  try {
    // Get base daily limit from env - use admin limit if user is admin
    let baseLimit: number;
    baseLimit = (isAdmin(user)) ? +process.env.TOKENS_DAILY_LIMIT_ADMIN : +process.env.TOKENS_DAILY_LIMIT;

    // Find user's invite code
    const invite = await Invite.findOne({ owner: user._id });

    // Calculate bonus based on referrals
    let referralBonus = 0;
    if (invite) {
      // Each used invite adds TOKENS_DAILY_PER_REFERRAL to the daily limit
      const usedInvitesCount = invite.usedBy.length;
      const bonusPerReferral = isAdmin(user) ? +process.env.TOKENS_DAILY_PER_REFERRAL_ADMIN : +process.env.TOKENS_DAILY_PER_REFERRAL
      referralBonus = usedInvitesCount * bonusPerReferral;
    }

    // Return the total daily limit
    return baseLimit + referralBonus;
  } catch (error) {
    console.error('Error calculating daily token limit:', error);
    // Return default limit in case of error
    return +(process.env.TOKENS_DAILY_LIMIT || 100000);
  }
}

// Calculate daily web search limit including friend bonuses
export async function getDailyWebSearchLimit(user: IUser): Promise<number> {
  try {
    // Get base daily limit from env or default to 50
    const baseLimit = +(process.env.WEB_SEARCH_DAILY_LIMIT || 50);
    
    // Find user's invite code
    const invite = await Invite.findOne({ owner: user._id });
    
    // Calculate bonus based on referrals
    let referralBonus = 0;
    if (invite) {
      // Each used invite adds WEB_SEARCH_REFERRAL_BONUS to the daily limit
      const usedInvitesCount = invite.usedBy.length;
      referralBonus = usedInvitesCount * (+(process.env.WEB_SEARCH_REFERRAL_BONUS) || 5);
    }
    
    // Return the total daily limit
    return baseLimit + referralBonus;
  } catch (error) {
    console.error('Error calculating daily web search limit:', error);
    // Return default limit in case of error
    return +(process.env.WEB_SEARCH_DAILY_LIMIT || 50);
  }
}

// Get hourly token usage (existing function)
export async function getPeriodTokenUsage(user: IUser) {
  try {
    // Calculate the start of the current hour (fixed window)
    const currentHourStart = new Date();
    currentHourStart.setMinutes(0, 0, 0); // Set to XX:00:00.000
    
    // Get usage from the current hour only
    const result = await Usage.aggregate([
      { 
        $match: { 
          user: user._id,
          created: { $gte: currentHourStart },
          type: { $in: ['prompt', 'completion'] }
        } 
      },
      { 
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Return the total as a number - if no results, return 0
    return result.length > 0 ? result[0].total : 0;
    
  } catch (e) {
    console.error('Error calculating period token usage:', e);
    return 0;
  }
}

// Get daily token usage (NEW)
export async function getDailyTokenUsage(user: IUser) {
  try {
    // Calculate the start of the current day
    const startOfDay = moment().startOf('day').toDate();
    
    // Get usage from the current day
    const result = await Usage.aggregate([
      { 
        $match: { 
          user: user._id,
          created: { $gte: startOfDay },
          type: { $in: ['prompt', 'completion'] }
        } 
      },
      { 
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Return the total as a number - if no results, return 0
    return result.length > 0 ? result[0].total : 0;
    
  } catch (e) {
    console.error('Error calculating daily token usage:', e);
    return 0;
  }
}

// Get daily web search usage
export async function getDailyWebSearchUsage(user: IUser) {
  try {
    // Calculate the start of the current day
    const startOfDay = moment().startOf('day').toDate();
    
    // Get usage from the current day
    const result = await Usage.aggregate([
      { 
        $match: { 
          user: user._id,
          created: { $gte: startOfDay },
          type: 'web_search'
        } 
      },
      { 
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Return the total as a number - if no results, return 0
    return result.length > 0 ? result[0].total : 0;
    
  } catch (e) {
    console.error('Error calculating daily web search usage:', e);
    return 0;
  }
}

// DEPRECATED: Keep for backward compatibility but now uses daily
export async function getPeriodWebSearchUsage(user: IUser) {
  // Redirect to daily usage for web search
  return await getDailyWebSearchUsage(user);
}

export async function logTokenUsage(user: IUser, thread: any, inputTokens: number, outputTokens: number, model: string, bot: TelegramBot) {
  try {
    // Log input tokens (prompt)
    if (inputTokens > 0) {
      await new Usage({
        user: user._id,
        thread: thread._id,
        type: 'prompt',
        amount: inputTokens,
        modelName: model,
        description: `Input tokens for thread ${thread._id}`
      }).save();
    }
    
    // Log output tokens (completion)
    if (outputTokens > 0) {
      await new Usage({
        user: user._id,
        thread: thread._id,
        type: 'completion',
        amount: outputTokens,
        modelName: model,
        description: `Output tokens for thread ${thread._id}`
      }).save();
    }

    // Send notification to user via bot
    // if( isAdmin(user) ) {
    //   const message = `Tokens used:\nInput: ${inputTokens}\nOutput: ${outputTokens}\nModel: ${model}`;
    //   await sendMessage({
    //     text: message,
    //     user,
    //     bot
    //   })
    // }
  } catch (error) {
    console.error('Error logging token usage:', error);
  }
}

export async function logWebSearchUsage(user: IUser, thread: any, searchCount: number, model: string, bot: TelegramBot) {
  try {
    if (searchCount > 0) {
      await new Usage({
        user: user._id,
        thread: thread._id,
        type: 'web_search',
        amount: searchCount,
        modelName: model,
        description: `Web searches for thread ${thread._id}`
      }).save();

      // Send notification to user via bot
      // if( isAdmin(user) ) {
      //   const message = `Search used: ${searchCount}`;
      //   await sendMessage({
      //     text: message,
      //     user,
      //     bot
      //   })
      // }

    }
  } catch (error) {
    console.error('Error logging web search usage:', error);
  }
}

export async function logLimitHit(user: IUser, type: LimitType, usage: number, limit: number): Promise<void> {
  console.log('function: logLimitHit', type, usage, limit)
  try {
    await new Limit({
      user: user._id,
      type,
      usage,
      limit
    }).save();
  } catch (error) {
    console.error('Error logging limit hit:', error);
  }
}