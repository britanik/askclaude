import { IUser } from '../interfaces/users';
import User from '../models/users';
import { sendMessage } from '../templates/sendMessage';
import TelegramBot from 'node-telegram-bot-api';

interface SendNotificationResult {
  success: number;
  failed: number;
  total: number;
  errors: Array<{ userId: string, error: any }>;
}

export async function sendNotificationToAllUsers(
  text: string,
  bot: TelegramBot,
  adminUser: IUser
): Promise<SendNotificationResult> {
  // Get all active (non-blocked) users
  const allUsers = await User.find();
  
  // Send in-progress message to admin
  await sendMessage({
    text: `Отправка уведомлений ${allUsers.length} пользователям...`,
    user: adminUser,
    bot
  });
  
  // Prepare to send notifications to all users
  const sendPromises = allUsers.map(user => {
    return new Promise<{ success: boolean, user: IUser, error?: any }>(resolve => {
      sendMessage({
        text,
        user,
        bot
      })
      .then(() => {
        resolve({ success: true, user });
      })
      .catch(error => {
        resolve({ success: false, user, error });
      });
    });
  });
  
  // Send all notifications and collect results
  const results = await Promise.allSettled(sendPromises);
  
  // Process the results
  const successfulResults = results
    .filter(r => r.status === 'fulfilled' && (r.value as any).success)
    .map(r => (r as PromiseFulfilledResult<any>).value);
  
  const failedResults = results
    .filter(r => r.status === 'fulfilled' && !(r.value as any).success)
    .map(r => (r as PromiseFulfilledResult<any>).value);
  
  const rejectedResults = results
    .filter(r => r.status === 'rejected')
    .map(r => ({ success: false, error: (r as PromiseRejectedResult).reason }));
  
  // Prepare error information
  const errors = [
    ...failedResults.map(r => ({ userId: r.user._id.toString(), error: r.error })),
    ...rejectedResults.map(r => ({ userId: 'unknown', error: r.error }))
  ];
  
  // Return statistics
  return {
    success: successfulResults.length,
    failed: failedResults.length + rejectedResults.length,
    total: allUsers.length,
    errors
  };
}