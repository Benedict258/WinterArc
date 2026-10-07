import mongoose from 'mongoose'

const settingsSchema = new mongoose.Schema(
  {
    timezone: {
      type: String,
      default: 'Africa/Lagos',
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

export const Settings = mongoose.model('Settings', settingsSchema)
