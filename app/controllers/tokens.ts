import { IUser } from '../interfaces/users';
import User from '../models/users';
import Usage from '../models/usage';
import Invite from '../models/invites';
import TelegramBot from 'node-telegram-bot-api';
import { sendMessage } from '../templates/sendMessage';
import { isAdmin } from '../helpers/helpers';
import moment from 'moment';

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

// Check if user is at the limit
export async function isTokenLimit(user: IUser) {
  console.log('Checking token limit for user:', user._id);
  try {
    const usage: number = await getPeriodTokenUsage(user);
    const periodLimit = await getPeriodTokenLimit(user);
    
    console.log('Usage:', usage);
    console.log('Period Limit:', periodLimit);
    
    if (usage >= periodLimit) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking token limit:', error);
    return false;
  }
}

// Check if user is at the web search limit (CHANGED TO DAILY)
export async function isWebSearchLimit(user: IUser) {
  try {
    const usage: number = await getDailyWebSearchUsage(user);
    const dailyLimit = await getDailyWebSearchLimit(user);
    
    if (usage >= dailyLimit) {
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

// Calculate minutes until tomorrow (for daily limits)
export function getMinutesToNextDay() {
  const now = moment();
  const tomorrow = moment().add(1, 'day').startOf('day');
  return tomorrow.diff(now, 'minutes');
}

// Calculate period token limit including friend bonuses
export async function getPeriodTokenLimit(user: IUser): Promise<number> {
  try {    
    // Get base limit from env or default to 50000
    const baseLimit = +(process.env.TOKENS_HOUR_LIMIT || 10000);

    console.log('Base Limit:', baseLimit);
    
    // Find user's invite code
    const invite = await Invite.findOne({ owner: user._id });
    
    // Calculate bonus based on referrals
    let referralBonus = 0;
    if (invite) {
      // Each used invite adds TOKENS_PER_REFERRAL to the limit
      const usedInvitesCount = invite.usedBy.length;
      referralBonus = usedInvitesCount * (+(process.env.TOKENS_PER_REFERRAL) || 10000);
    }
    
    // Return the total limit
    return baseLimit + referralBonus;
  } catch (error) {
    console.error('Error calculating period token limit:', error);
    // Return default limit in case of error
    return +(process.env.BASE_TOKEN_LIMIT || 50000);
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

    console.log(`Token usage for user ${user._id} since ${currentHourStart.toISOString()}:`, result);

    // Return the total as a number - if no results, return 0
    return result.length > 0 ? result[0].total : 0;
    
  } catch (e) {
    console.error('Error calculating period token usage:', e);
    return 0;
  }
}

// NEW: Get daily web search usage
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
    if( isAdmin(user) ) {
      const message = `Tokens used:\nInput: ${inputTokens}\nOutput: ${outputTokens}\nModel: ${model}`;
      await sendMessage({
        text: message,
        user,
        bot
      })
    }
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
      if( isAdmin(user) ) {
        const message = `Search used: ${searchCount}`;
        await sendMessage({
          text: message,
          user,
          bot
        })
      }

    }
  } catch (error) {
    console.error('Error logging web search usage:', error);
  }
}