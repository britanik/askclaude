import { IUser } from "../interfaces/users";
import { sendMessage } from "./sendMessage";
import TelegramBot from "node-telegram-bot-api";
import Dict from "../helpers/dict";
import { getTokenLimitMessage } from "../controllers/tokens";
import { isAdmin } from "../helpers/helpers";
import * as userController from "../controllers/users";
import { PLANS, PaymentPlan } from "../controllers/payments";

export async function tmplLimits(user: IUser, bot: TelegramBot, dict: Dict) {

  await userController.updateMessage(user, 'payConfirm', null);

  // Show limit message with plan selection buttons (only for admin)
  const limitMessage = await getTokenLimitMessage(user);

  const planButtons = Object.entries(PLANS).map(([plan, config]) => ({
    text: `${config.duration} - ${config.price} рублей`,
    callback_data: JSON.stringify({ a: 'payConfirm', plan: plan as PaymentPlan })
  }));

  await sendMessage({
    text: limitMessage,
    user,
    bot,
    buttons: isAdmin(user) ? [planButtons] : undefined
  });
}