import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

const settingsSchema = new mongoose.Schema(
  {
    userId: { type: tenantField.type, ref: 'User', required: true, unique: true }, // one document per user
    timezone: {
      type: String,
      default: 'UTC',
    },
    weeklyGenerationRules: mongoose.Schema.Types.Mixed,
    // 'YYYY-MM-DD' of the last day generateToday() committed; claimed atomically
    lastGeneratedDate: {
      type: String,
      default: null,
    },
    multipleThreadsPerWeekTarget: {
      type: Number,
      default: 3,
    },
    notifications: {
      dailyPlan: {
        enabled: { type: Boolean, default: true },
        time: { type: String, default: '07:30' },
      },
      dueTasks: {
        enabled: { type: Boolean, default: true },
      },
      eventReminders: {
        enabled: { type: Boolean, default: true },
        minutesBefore: { type: Number, default: 15 },
      },
    },
    gridBalancing: {
      maxDailyIntensity: {
        type: Number,
        default: 6,
      },
      preferLowIntensityOnBusyDays: {
        type: Boolean,
        default: true,
      },
    },
  },
  { timestamps: true }
)

settingsSchema.plugin(tenantGuard)

export const Settings = mongoose.model('Settings', settingsSchema)
