import moment from 'moment';
import TelegramBot from 'node-telegram-bot-api';
import { IUser } from '../interfaces/users';
import Bonus from '../models/bonus';
import User from '../models/users';
import Dict from '../helpers/dict';
import { sendMessage } from '../templates/sendMessage';
import { isAdmin, isTester } from '../helpers/helpers';

export async function createBonus(user: IUser, type: 'story' | 'promo', amount: number, source: string, description?: string): Promise<boolean> {
  try {
    await new Bonus({ user: user._id, type, amount, source, description }).save();
    return true;
  } catch (e: any) {
    if (e.code === 11000) return false; // duplicate
    console.error('Error creating bonus:', e);
    return false;
  }
}

export async function getUserBonusTotal(user: IUser): Promise<number> {
  try {
    const now = new Date();
    const result = await Bonus.aggregate([
      {
        $match: {
          user: user._id,
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    return result.length > 0 ? result[0].total : 0;
  } catch (e) {
    console.error('Error getting user bonus total:', e);
    return 0;
  }
}

export async function processStory(user: IUser, bot: TelegramBot): Promise<void> {
  let bonusAmount: number;
  if (isAdmin(user)) {
    bonusAmount = +process.env.TOKENS_BONUS_STORY_ADMIN;
  } else if (isTester(user)) {
    bonusAmount = +process.env.TOKENS_BONUS_STORY_TESTER || +(process.env.TOKENS_BONUS_STORY || 10000);
  } else {
    bonusAmount = +(process.env.TOKENS_BONUS_STORY || 10000);
  }
  const today = moment().format('YYYY-MM-DD');
  const source = `story_${today}`;
  const created = await createBonus(user, 'story', bonusAmount, source);
  if (created) {
    const dict = new Dict(user);
    const text = dict.getString('BONUS_STORY_THANKS', { amount: bonusAmount.toLocaleString('ru-RU') });
    await sendMessage({ text, user, bot });

    if (process.env.NOTIFY_ADMIN_STORY_PUBLISHED === '1') {
      const adminUser = await User.findOne({ username: process.env.ADMIN_USERNAME });
      if (adminUser) {
        const who = user.username ? `@${user.username}` : user.name;
        await bot.sendMessage(adminUser.chatId, `📱 Story опубликована: ${who}, +${bonusAmount.toLocaleString('ru-RU')} токенов`);
      }
    }
  }
}
