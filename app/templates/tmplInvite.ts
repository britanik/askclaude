import { IUser } from "../interfaces/users";
import { sendMessage } from "./sendMessage";
import TelegramBot from "node-telegram-bot-api";
import Dict from "../helpers/dict";
import { generateInviteCode } from "../controllers/invites";

export async function tmplInvite(user: IUser, bot: TelegramBot, dict: Dict) {
  // Get or generate an invite code for this user
  const inviteCode = await generateInviteCode(user);
  
  // Create the invitation message with the user's unique code
  const text = `Попробуй Claude AI в Telegram. Общайся текстом, голосовыми сообщениям, фотографиями. Твой код для получения 100,000 бесплатных токенов: <code>${inviteCode}</code>. Ссылка: https://t.me/${process.env.CLIENT_BOT_NAME}?start=${inviteCode}`;
  
  await sendMessage({ 
    text: 'Перешли следующее сообщение друзьям:', 
    user, 
    bot 
  });

  await sendMessage({ 
    text, 
    user, 
    bot 
  });
}