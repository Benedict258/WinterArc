import mongoose from 'mongoose'

const weeklyProgressSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      required: true,
    },
    weekStart: {
      type: Date,
      required: true,
    },
    appearances: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
)

// Compound index to ensure one entry per thread per week
weeklyProgressSchema.index({ threadId: 1, weekStart: 1 }, { unique: true })

export const WeeklyProgress = mongoose.model('WeeklyProgress', weeklyProgressSchema)
