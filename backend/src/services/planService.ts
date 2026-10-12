import { User } from '../models/User'
import { PLANS, type Limits, type PlanId } from '../../../src/shared/plans'

const MB = 1024 * 1024
const num = (v: string | undefined) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)

/** Free-plan limits can be tuned from the environment without a code change. */
function freeLimits(): Limits {
  const base = PLANS.free.limits
  return {
    ...base,
    dropQuotaBytes: (num(process.env.DROP_QUOTA_MB) ?? base.dropQuotaBytes / MB) * MB,
    dropMaxFileBytes: (num(process.env.DROP_MAX_FILE_MB) ?? base.dropMaxFileBytes / MB) * MB,
    dropMaxItems: num(process.env.DROP_MAX_ITEMS) ?? base.dropMaxItems,
    aiMonthlyTokens: num(process.env.AI_MONTHLY_TOKENS) ?? base.aiMonthlyTokens,
    aiDailyTokens: num(process.env.AI_DAILY_TOKENS) ?? base.aiDailyTokens,
    maxThreads: num(process.env.MAX_THREADS_FREE) ?? base.maxThreads,
  }
}

/** The plan in force right now: a paid plan that has lapsed is the free plan. */
export function effectivePlan(user: { plan?: string | null; planExpiresAt?: Date | null } | null, now = new Date()): PlanId {
  if (!user || user.plan !== 'pro') return 'free'
  return user.planExpiresAt && user.planExpiresAt.getTime() <= now.getTime() ? 'free' : 'pro'
}

export const limitsForPlan = (plan: PlanId): Limits => (plan === 'pro' ? PLANS.pro.limits : freeLimits())

export async function getPlan(userId: string): Promise<{ plan: PlanId; limits: Limits; expiresAt: Date | null }> {
  const user = await User.findOne({ _id: userId }, { plan: 1, planExpiresAt: 1 })
  const plan = effectivePlan(user)
  return { plan, limits: limitsForPlan(plan), expiresAt: plan === 'pro' ? user?.planExpiresAt ?? null : null }
}

export const getLimits = async (userId: string) => (await getPlan(userId)).limits
