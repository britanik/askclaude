import { IUser } from "../interfaces/users";
import { sendMessage } from "./sendMessage";
import TelegramBot from "node-telegram-bot-api";
import { generatePaymentToken } from "../helpers/paymentToken";
import { PaymentPlan, PLANS } from "../controllers/payments";

export async function tmplPayConfirm(user: IUser, bot: TelegramBot, plan: PaymentPlan) {
  const planDetails = PLANS[plan];
  const paymentToken = generatePaymentToken(user._id, plan);

  const formatNumber = (n: number) => n.toLocaleString('ru-RU');
  const text = `Пакет: +${formatNumber(planDetails.tokenLimit)} токенов на ${planDetails.label} за ${planDetails.price} рублей.

Оферта, Политика использования, Реквизиты - https://askclaude.ru/legal

ℹ️ Безопасная оплата картой или СБП через сервис CloudPayments (принадлежит группе Т-Банк).`;

  await sendMessage({
    text,
    user,
    bot,
    deletable: 'payConfirm',
    buttons: [[{
      text: 'Перейти к оплате',
      url: `https://askclaude.ru/pay?token=${paymentToken}`
    }]]
  });
}
