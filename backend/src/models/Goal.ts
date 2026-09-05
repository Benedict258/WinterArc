import mongoose from 'mongoose'

const goalSchema = new mongoose.Schema(
  {
    period: {
      type: String,
      required: true, // e.g., "Q4-2026"
    },
    text: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
)

export const Goal = mongoose.model('Goal', goalSchema)
