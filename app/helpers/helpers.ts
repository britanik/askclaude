import moment from 'moment'
import { EditMessageTextOptions, InlineKeyboardButton, KeyboardButton, SendMessageOptions } from 'node-telegram-bot-api'
import { IUser } from '../interfaces/users'
import { IThread } from '../interfaces/threads'
import { IPackage } from '../interfaces/packages'
import Package from '../models/packages'
import { PLANS } from '../controllers/payments'

export interface IGetOptionsParams {
  buttons?: InlineKeyboardButton[][],
  keyboard?: KeyboardButton[][],
  chat_id?: number,
  message_id?: number,
  placeholder?: string,
  force_reply?: boolean,
  parseMode?: 'HTML' | 'MarkdownV2'
}

export const getOptions = ( params?:IGetOptionsParams ) => {
  let { buttons = [], keyboard, chat_id, message_id, placeholder, force_reply, parseMode = 'HTML' } = params || {}
  
  if( placeholder ){
    force_reply = true
  }

  let options:SendMessageOptions | EditMessageTextOptions = {
    chat_id: chat_id,
    message_id: message_id,
    parse_mode: parseMode,
    disable_web_page_preview: true,
    reply_markup: {
      resize_keyboard: true,
      inline_keyboard: buttons ?? [],
      keyboard: keyboard ?? [],
      // force_reply: false,
      // input_field_placeholder: '',
    }
  }

  // Теперь добавляем input_field_placeholder, если он задан
  if (placeholder) {
    options.reply_markup['input_field_placeholder'] = placeholder
  }
  
  // Теперь добавляем force_reply, если он задан
  if (force_reply) {
    options.reply_markup['force_reply'] = force_reply
  }

  // console.log(options, 'options')
  return options
}

export function getReadableId( now = moment() ){
  const getRandomArbitrary = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; //Максимум не включается, минимум включается
  }

  let result = ''
  result += now.format('YYMMDD')
  result += '1'
  result += getRandomArbitrary(100000, 999999)
  
  return +result
}

export function isAdmin( user:IUser ){
  return (user.username == process.env.ADMIN_USERNAME)
}

export async function hasActivePackage( user:IUser ):Promise<boolean> {
  const now = new Date()
  const activeOrder = await Package.findOne({
    user: user._id,
    endDate: { $gt: now }
  })
  return !!activeOrder
}

// Alias for backward compatibility (images, web search limits)
export const isPremium = hasActivePackage

export async function getActivePackagesTotalTokens(user: IUser): Promise<number> {
  const now = new Date()
  const activePackages = await Package.find({ user: user._id, endDate: { $gt: now } })
  let total = 0
  for (const pkg of activePackages) {
    total += pkg.tokenLimit
  }
  return total
}

export async function getPackageRemainingTokens(user: IUser): Promise<number> {
  const now = new Date()
  const activePackages = await Package.find({ user: user._id, endDate: { $gt: now } })
  let total = 0
  for (const pkg of activePackages) {
    total += Math.max(0, pkg.tokenLimit - (pkg.tokensUsed || 0))
  }
  return total
}

export async function getActivePackagesSorted(user: IUser): Promise<IPackage[]> {
  const now = new Date()
  return Package.find({ user: user._id, endDate: { $gt: now } }).sort({ created: 1 })
}

export async function getTodayExpiredPackages(user: IUser): Promise<IPackage[]> {
  const startOfDay = moment().startOf('day').toDate()
  const now = new Date()
  return Package.find({
    user: user._id,
    endDate: { $gte: startOfDay, $lte: now }
  }).sort({ endDate: -1 })
}

// Когда пользователь превысил дневной лимит, эта функция записывает
// "лишние" токены (overflowTokens) в купленные пакеты.
// Пакеты расходуются по очереди: сначала самый старый (FIFO).
export async function attributePackageUsage(user: IUser, overflowTokens: number): Promise<void> {
  if (overflowTokens <= 0) return
  const packages = await getActivePackagesSorted(user)
  let remaining = overflowTokens
  for (const pkg of packages) {
    if (remaining <= 0) break
    const available = pkg.tokenLimit - (pkg.tokensUsed || 0)
    if (available <= 0) continue
    const toUse = Math.min(remaining, available)
    pkg.tokensUsed = (pkg.tokensUsed || 0) + toUse
    await pkg.save()
    remaining -= toUse
  }
}

export function isTester( user:IUser ){
  const testers = (process.env.TESTER_USERNAMES || '').split(',').map(s => s.trim()).filter(Boolean);
  return testers.includes(user.username);
}

export function canAccessPremium( user:IUser ){
  return process.env.PREMIUM_ENABLED === '1' || isAdmin(user) || isTester(user);
}

export function formatUsername(user: IUser) {
  return user.name
}

export function getReplyFooter(assistantType: string, isNewThread: boolean, model: string): string {
  let icon = (isNewThread) ? "🆕" : "➡️";
  return `\n\n${icon} ${assistantType} | ${model}`
}