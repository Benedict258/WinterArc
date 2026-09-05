import mongoose from 'mongoose'

const threadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['Role/Program', 'Active Build', 'Learning Track', 'Application/Outreach', 'Other'],
      default: 'Other',
    },
    frequency: {
      type: String,
      enum: ['daily', 'multiple', 'weekly', 'fixed-day'],
      required: true,
    },
    fixedDay: {
      type: Number, // 0 = Monday, 6 = Sunday
      min: 0,
      max: 6,
    },
    status: {
      type: String,
      enum: ['active', 'parked', 'archived'],
      default: 'active',
    },
    notes: String,
  },
  { timestamps: true }
)

export const Thread = mongoose.model('Thread', threadSchema)
