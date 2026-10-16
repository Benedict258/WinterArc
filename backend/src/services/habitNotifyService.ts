import { listHabits, monthlyOverview } from './habitService'
import { toMinutes, GRACE_MINUTES, HABIT_RECAP_CHECK, type NotificationSettings } from '../../../src/shared/notificationPlan'
import type { Payload } from './pushService'

const HABIT_RECAP_TIME = HABIT_RECAP_CHECK

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pct = (r: number) => `${Math.round(r * 100)}%`

type Hooks = { claim: (key: string) => Promise<boolean>; send: (payload: Payload) => Promise<unknown> }

/**
 * Habit push notifications for one person at this moment: an evening nudge for habits still open today,
 * and on the 1st a short recap of last month. Each is sent once (claimed by key). Milestones are sent when a check-in earns them.
 * Returns the keys sent.
 */
export async function runHabitNotifications(
  userId: string, now: Date, clock: { dayKey: string; minutes: number }, settings: NotificationSettings, hooks: Hooks,
): Promise<string[]> {
  const cfg = settings.habits
  if (!cfg?.enabled) return []
  const sent: string[] = []

  const at = toMinutes(cfg.time)
  if (clock.minutes >= at && clock.minutes < at + GRACE_MINUTES) {
    const { habits } = await listHabits(userId, now)
    const open = habits.filter(h => h.today.scheduled && !h.today.done)
    // Nothing to nag about when there are no habits or all are done: don't use up the day's claim either
    if (open.length > 0 && (await hooks.claim(`habit-remind:${clock.dayKey}`))) {
      const names = open.slice(0, 3).map(h => h.name).join(', ')
      await hooks.send({
        title: open.length === 1 ? 'One habit left today' : `${open.length} habits left today`,
        body: open.length > 3 ? `${names} and ${open.length - 3} more` : names,
        url: '/habits', tag: `habit-remind-${clock.dayKey}`,
      })
      sent.push(`habit-remind:${clock.dayKey}`)
    }
  }

  const recapAt = toMinutes(HABIT_RECAP_TIME)
  if (clock.dayKey.endsWith('-01') && clock.minutes >= recapAt && clock.minutes < recapAt + GRACE_MINUTES) {
    const { overall, habits } = await monthlyOverview(userId, now, 3)
    const prev = overall.find(o => o.month < clock.dayKey.slice(0, 7))
    if (prev && prev.scheduled > 0 && (await hooks.claim(`habit-month:${prev.month}`))) {
      const ranked = habits
        .map(h => ({ name: h.name, row: h.rows.find(r => r.month === prev.month) }))
        .filter(h => h.row && h.row.scheduled > 0)
        .sort((a, b) => b.row!.rate - a.row!.rate)
      const best = ranked[0]
      await hooks.send({
        title: `${MONTH_NAMES[Number(prev.month.slice(5)) - 1]} recap`,
        body: `You completed ${pct(prev.rate)} of your habit check-ins.${best ? ` Best: ${best.name} (${pct(best.row!.rate)}).` : ''}`,
        url: '/habits', tag: `habit-month-${prev.month}`,
      })
      sent.push(`habit-month:${prev.month}`)
    }
  }
  return sent
}
