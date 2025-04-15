import { IUser } from '../interfaces/users';
import User from '../models/users';
import Usage from '../models/usage';
import { IUsage } from '../interfaces/usage';

// Update user schema to include token_balance in prefs
export async function updateUserSchema() {
  // This function can be called manually with /updateUserSchema
  // to ensure all users have the token_balance field
  try {
    const users = await User.find({ 'prefs.token_balance': { $exists: false } });
    
    let updateCount = 0;
    for (const user of users) {
      if (user.prefs.token_balance === undefined) {
        user.prefs.token_balance = +process.env.TOKENS_START_AMOUNT || 100000;
        await user.save();
        updateCount++;
      }
    }
    
    if (updateCount > 0) {
      console.log(`Updated ${updateCount} users with token_balance field`);
    }
  } catch (error) {
    console.error('Error updating user schema:', error);
  }
}

// Add tokens to a user's balance
export async function addTokens(user: IUser, reason: string, amount?: number): Promise<void> {
  try {
    const tokensToAdd = amount || +process.env.TOKENS_PER_REFERRAL || 100000;
    
    // Initialize token_balance if it doesn't exist
    if (!user.prefs.token_balance) {
      user.prefs.token_balance = +process.env.TOKENS_START_AMOUNT || 100000;
    }
    
    // Add tokens
    user.prefs.token_balance += tokensToAdd;
    
    // Create usage record
    await new Usage({
      user: user._id,
      type: reason,
      amount: tokensToAdd,
      description: `Added ${tokensToAdd} tokens for reason: ${reason}`
    }).save();
    
    // Save user
    await user.save();
    
    // Log token addition
    console.log(`Added ${tokensToAdd} tokens to user ${user._id} for reason: ${reason}`);
    
  } catch (error) {
    console.error('Error adding tokens:', error);
    throw error;
  }
}

export async function logTokenUsage(user: IUser, thread: any, inputTokens: number, outputTokens: number, model: string) {
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
        model: model,
        description: `Output tokens for thread ${thread._id}`
      }).save();
    }
        
  } catch (error) {
    console.error('Error logging token usage:', error);
  }
}