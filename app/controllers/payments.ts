export type PaymentPlan = '24h' | '7d';

export interface PlanConfig {
  label: string;
  durationHours: number;
  price: number;
  tokenLimit: number;
}

export const PLANS: Record<PaymentPlan, PlanConfig> = {
  '24h': { label: '24 часа', durationHours: 24, price: 49, tokenLimit: 120000 },
  '7d':  { label: '7 дней',  durationHours: 168, price: 249, tokenLimit: 480000 }
};
