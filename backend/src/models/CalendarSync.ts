import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

const calendarSyncSchema = new mongoose.Schema(
  {
    userId: { type: tenantField.type, ref: 'User', required: true, unique: true }, // one document per user
    googleAccountId: String,
    accessToken: String,
    refreshToken: String,
    lastSyncedAt: Date,
    expiresAt: Date,
  },
  { timestamps: true }
)

calendarSyncSchema.plugin(tenantGuard)

export const CalendarSync = mongoose.model('CalendarSync', calendarSyncSchema)
