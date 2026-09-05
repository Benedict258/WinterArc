import mongoose from 'mongoose'

const calendarSyncSchema = new mongoose.Schema(
  {
    googleAccountId: String,
    accessToken: String,
    refreshToken: String,
    lastSyncedAt: Date,
    expiresAt: Date,
  },
  { timestamps: true }
)

export const CalendarSync = mongoose.model('CalendarSync', calendarSyncSchema)
