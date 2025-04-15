import { IUser } from '../interfaces/users';
import Invite, { IInvite } from '../models/invites'
import { addTokens } from './tokens';

function generateRandomCode(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// Generate or retrieve an invite code for a user
export async function generateInviteCode(user: IUser): Promise<string> {
  try {
    // Check if user already has an invite code
    let invite = await Invite.findOne({ owner: user._id });
    
    if (invite) {
      return invite.code;
    }
    
    // Generate a new code
    let code = generateRandomCode();
    
    // Ensure code is unique
    while (await Invite.findOne({ code })) {
      code = generateRandomCode();
    }
    
    // Create and save the new invite
    invite = new Invite({
      code,
      owner: user._id,
      usedBy: []
    });
    
    await invite.save();
    return code;
  } catch (error) {
    console.error('Error generating invite code:', error);
    return generateRandomCode(); // Fallback to random code without saving
  }
}

export async function isValidInviteCode(code: string): Promise<IInvite | null> {
  return await Invite.findOne({ code }).populate('owner');
}

// Process a referral when a new user signs up with an invite code
export async function processReferral(newUser: IUser, invite: IInvite): Promise<boolean> {
  try {
        
    // Check if the owner is trying to use their own code
    if( invite.owner._id.equals(newUser._id) ){
      return false;
    }
    
    // Check if this user has already used a code
    const existingInviteUse = await Invite.findOne({ usedBy: newUser._id });
    if (existingInviteUse) {
      return false;
    }
    
    // Add new user to the list of users who used this code
    invite.usedBy.push(newUser);
    await invite.save();
    
    // Credit tokens to both users

    // Credit the invite owner
    await addTokens(invite.owner, 'referral_bonus');
    
    // Credit the new user
    await addTokens(newUser, 'referral_welcome');
    
    return true;
  } catch (error) {
    console.error('Error processing referral:', error);
    return false;
  }
}

export function extractReferralCode(msg: any): string | null {
  // No message or no text - no code
  if (!msg || !msg.text) {
    return null;
  }
  
  // Check if it's a /start command with parameter
  if (msg.text.startsWith('/start ')) {
    const parts = msg.text.split(' ');
    if (parts.length > 1 && parts[1].trim()) {
      return parts[1].trim();
    }
  }
  
  // Check if it contains a numeric code (5 digits)
  const codeRegex = /\b\d{5}\b/;
  const match = msg.text.match(codeRegex);
  if (match) {
    return match[0];
  }
  
  // No code found
  return null;
}