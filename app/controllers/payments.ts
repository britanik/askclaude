export type PaymentPlan = '24h' | '7d';

export interface PlanConfig {
  duration: string;
  price: number;
}

export const PLANS: Record<PaymentPlan, PlanConfig> = {
  '24h': { duration: '24 часа', price: 49 },
  '7d': { duration: '7 дней', price: 249 }
};
