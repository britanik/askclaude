import { IUser } from "../interfaces/users";
import { sendMessage } from "./sendMessage";
import TelegramBot from "node-telegram-bot-api";
import Dict from "../helpers/dict";
import { generatePaymentToken } from "../helpers/paymentToken";
import { PaymentPlan, PLANS } from "../controllers/payments";

export async function tmplPayConfirm(user: IUser, bot: TelegramBot, plan: PaymentPlan, dict: Dict) {
  const planDetails = PLANS[plan];
  const paymentToken = generatePaymentToken(user._id, plan);

  const formatNumber = (n: number) => n.toLocaleString('ru-RU');
  const tokens = formatNumber(planDetails.tokenLimit);
  const text = `${dict.getString('PAY_CONFIRM_HEADER', { tokens, label: planDetails.label, price: String(planDetails.price) })}

<i>ℹ️ ${dict.getString('PAY_CONFIRM_INFO', { tokens })}</i>

<i>${dict.getString('PAY_CONFIRM_SECURITY')}</i>`;

  await sendMessage({
    text,
    user,
    bot,
    deletable: 'payConfirm',
    buttons: [[{
      text: dict.getString('PAY_CONFIRM_BUTTON'),
      url: `https://askclaude.ru/pay?token=${paymentToken}`
    }]]
  });
}
