import { IUser } from '../interfaces/users';
import User from '../models/users'

// Update user schema to include token_balance in prefs
export async function updateUserSchema() {
  // This function can be called manually with /updateUserSchema
  // to ensure all users have the token_balance field
  try {
    const users = await User.find({ 'prefs.token_balance': { $exists: false } });
    
    let updateCount = 0;
    for (const user of users) {
      if (user.prefs.token_balance === undefined) {
        user.prefs.token_balance = 0;
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
export async function addTokens(user: IUser, reason: string): Promise<void> {
  try {
    // Initialize token_balance if it doesn't exist
    if (!user.prefs.token_balance) {
      user.prefs.token_balance = 0;
    }
    
    // Add tokens
    user.prefs.token_balance += +process.env.TOKENS_PER_REFERRAL;
    
    // Save user
    await user.save();
    
    // Log token addition if needed
    console.log(`Added ${process.env.TOKENS_PER_REFERRAL} tokens to user ${user._id} for reason: ${reason}`);
    
  } catch (error) {
    console.error('Error adding tokens:', error);
    throw error;
  }
}