import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

// Remembers which reminders were already sent to which user so a restart or a
// second process can't send them twice. Old entries expire on their own.
const notificationLogSchema = new mongoose.Schema({
  userId: tenantField,
  key: { type: String, required: true },
  sentAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 14 },
})

notificationLogSchema.index({ userId: 1, key: 1 }, { unique: true })
notificationLogSchema.plugin(tenantGuard)

export const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema)
