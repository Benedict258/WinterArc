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
      emailDigest: {
        enabled: { type: Boolean, default: false },
        time: { type: String, default: '07:30' },
      },
      eventReminders: {
        enabled: { type: Boolean, default: true },
        minutesBefore: { type: Number, default: 15 },
      },
    },
    // Planner rules and day structure. Defaults reproduce the original behaviour.
    planner: {
      rollover: { type: Boolean, default: true },
      makeup: { type: Boolean, default: true },
      backlogPerDay: { type: Number, default: 2, min: 0, max: 5 },
      dueWindowDays: { type: Number, default: 3, min: 0, max: 14 },
      // ordered day structure (2-6 blocks); see src/shared/dayBlocks.ts. Unset = defaults.
      blocks: { type: mongoose.Schema.Types.Mixed, default: undefined },
    },
    appearance: {
      mode: { type: String, enum: ['dark', 'light', 'system'], default: 'dark' },
      accent: { type: String, default: 'lime', maxlength: 24 },
      density: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' },
    },
    modules: {
      wishlist: { type: Boolean, default: true },
      goals: { type: Boolean, default: true },
      drop: { type: Boolean, default: true },
      events: { type: Boolean, default: true },
      ai: { type: Boolean, default: true },
    },
    // When the notification scheduler should next look at this user (see notificationService).
    nextCheckAt: { type: Date, default: () => new Date(0), index: true },
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
