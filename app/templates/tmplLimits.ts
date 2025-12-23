import { IUser } from "../interfaces/users";
import { sendMessage } from "./sendMessage";
import TelegramBot from "node-telegram-bot-api";
import Dict from "../helpers/dict";
import { getTokenLimitMessage } from "../controllers/tokens";
import { isAdmin } from "../helpers/helpers";
import * as userController from "../controllers/users";

export async function tmplLimits(user: IUser, bot: TelegramBot, dict: Dict) {

  await userController.updateMessage(user, 'payConfirm', null);
  
  // Show limit message with plan selection buttons (only for admin)
  const limitMessage = await getTokenLimitMessage(user);
  await sendMessage({
    text: limitMessage,
    user,
    bot,
    buttons: isAdmin(user) ? [[{
      text: '24 часа - 49 рублей',
      callback_data: JSON.stringify({ a: 'payConfirm', plan: '24h' })
    },{
      text: '7 дней - 249 рублей',
      callback_data: JSON.stringify({ a: 'payConfirm', plan: '7d' })
    }]] : undefined
  });
}