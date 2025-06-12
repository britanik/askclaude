import { IUser } from '../interfaces/users';
import User from '../models/users';
import { sendMessage } from '../templates/sendMessage';
import TelegramBot from 'node-telegram-bot-api';

export async function sendNotification(text: string, adminUser: IUser, bot: TelegramBot): Promise<void> {
  let users = await User.find()

  // Send in-progress message to admin
  await sendMessage({
    text: `Отправка уведомлений ${users.length} пользователям...`,
    user: adminUser,
    bot
  });

  if (users.length > 0) {
    let success = 0;
    let failed = 0;
    let i = 0;

    // Process users sequentially with delay
    for (const user of users) {      
      try {
        await sendMessage({
          user,
          text,
          bot,
        });
        success++;
      } catch (e) {
        failed++;
        if (e.response?.body?.error_code === 403) {
          console.log(e.response.body.error_code, 'Send text error');
          user.blocked = true;
          await user.save();
        }
      }
      
      // Add 100ms delay between each user (0.1 seconds)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await sendMessage({
      text: `Результаты: ${success} успешно, ${failed} остальные не доставлены.`,
      user: adminUser,
      bot
    });
  }
}