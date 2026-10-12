// What each plan allows. Shared by the server (enforcement) and the screens (usage bars, pricing).

export type PlanId = 'free' | 'pro'

export type Limits = {
  dropQuotaBytes: number
  dropMaxFileBytes: number
  dropMaxItems: number
  aiMonthlyTokens: number
  aiDailyTokens: number
  /** non-archived threads you own */
  maxThreads: number
  /** accountability partners */
  maxPartners: number
  /** people you can add to threads you share, in total */
  maxSharedMembers: number
}

export type Plan = { id: PlanId; label: string; blurb: string; priceUsdMonthly: number; limits: Limits }

const MB = 1024 * 1024

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free', label: 'Free', blurb: 'Everything you need to plan your days', priceUsdMonthly: 0,
    limits: { dropQuotaBytes: 200 * MB, dropMaxFileBytes: 25 * MB, dropMaxItems: 300, aiMonthlyTokens: 300_000, aiDailyTokens: 100_000, maxThreads: 30, maxPartners: 3, maxSharedMembers: 5 },
  },
  pro: {
    id: 'pro', label: 'Pro', blurb: 'More storage, a bigger AI allowance and room for teams', priceUsdMonthly: 5,
    limits: { dropQuotaBytes: 5 * 1024 * MB, dropMaxFileBytes: 200 * MB, dropMaxItems: 5000, aiMonthlyTokens: 3_000_000, aiDailyTokens: 600_000, maxThreads: 500, maxPartners: 25, maxSharedMembers: 100 },
  },
}

export const isPlanId = (v: unknown): v is PlanId => v === 'free' || v === 'pro'

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(bytes % (1024 * MB) === 0 ? 0 : 1)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
