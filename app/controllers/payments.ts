export type PaymentPlan = '24h' | '7d';

export interface PlanConfig {
  label: string;
  durationMinutes: number;
  price: number;
  tokenLimit: number;
}

export const PLANS: Record<PaymentPlan, PlanConfig> = {
  '24h': { label: '24 часа', durationMinutes: 1440, price: 49, tokenLimit: 120000 },
  '7d':  { label: '7 дней',  durationMinutes: 10080, price: 249, tokenLimit: 480000 }
};
