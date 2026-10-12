import mongoose from 'mongoose'

// Remembers which reminders were already sent (unique key) so a restart or a
// second process can't send them twice. Old entries expire on their own.
const notificationLogSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  sentAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 14 },
})

export const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema)
