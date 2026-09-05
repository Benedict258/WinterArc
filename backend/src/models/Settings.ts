import mongoose from 'mongoose'

const settingsSchema = new mongoose.Schema(
  {
    timezone: {
      type: String,
      default: 'Africa/Lagos',
    },
    weeklyGenerationRules: mongoose.Schema.Types.Mixed,
    multipleThreadsPerWeekTarget: {
      type: Number,
      default: 3,
    },
  },
  { timestamps: true }
)

export const Settings = mongoose.model('Settings', settingsSchema)
