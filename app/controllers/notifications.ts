import { IUser } from '../interfaces/users';
import User from '../models/users';
import { sendMessage } from '../templates/sendMessage';
import TelegramBot from 'node-telegram-bot-api';

export async function sendNotification(text: string, adminUser:IUser, bot:TelegramBot): Promise<void> {

  let users = await User.find()

  // Send in-progress message to admin
  await sendMessage({
    text: `Отправка уведомлений ${users.length} пользователям...`,
    user: adminUser,
    bot
  });
  

  if (users.length > 0) {
    const results = await Promise.allSettled(
      users.map((user) =>
        sendMessage({
          user,
          text,
          bot,
        }).then(() => ({ user, success: true }))
          .catch((e) => {
            if (e.response.body.error_code === 403) {
              console.log(e.response.body.error_code, 'Send text error');
              user.blocked = true;
              user.save();
            }
            return { user, success: false };
          })
        
      )
    );

    // console.log(results,'results'):
    // [
    //   { status: 'fulfilled', value: { user: [Object], success: true } },
    //   { status: 'fulfilled', value: { user: [Object], success: true } },
    //   { status: 'fulfilled', value: { user: [Object], success: true } }
    // ] results

    const fulfilledResults = results.filter(result => result.status === 'fulfilled') as PromiseFulfilledResult<{ user: IUser; success: boolean; }>[];
    const success = fulfilledResults.filter((result) => result.value.success).length;
    const failed = fulfilledResults.length - success;

    console.log();

    await sendMessage({
      text: `Результаты: ${success} успешно, ${failed} остальные не доставлены.`,
      user: adminUser,
      bot
    });
  
  }
}