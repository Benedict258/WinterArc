import { Settings } from '../models/Settings'
import { markNotificationsDirty } from './notificationService'

/**
 * Apply an already-validated partial settings update. Nested groups merge field by
 * field so a partial update keeps the rest. Used by the settings API and the AI assistant.
 */
export async function updateSettings(userId: string, body: Record<string, any>) {
  let settings = await Settings.findOne({ userId })
  if (!settings) settings = new Settings({ userId })
  const { planner, notifications, gridBalancing, appearance, modules, ...rest } = body
  Object.assign(settings, rest)
  for (const [group, value] of Object.entries({ planner, notifications, gridBalancing, appearance, modules })) {
    if (!value) continue
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      settings.set(`${group}.${key}`, v)
    }
  }
  await settings.save()
  await markNotificationsDirty(userId) // timezone or reminder times may have changed
  return settings
}
