import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

// How much of a habit was done on one day. One document per habit per day; saving again replaces the value.
const habitLogSchema = new mongoose.Schema(
  {
    userId: tenantField,
    habitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Habit', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    value: { type: Number, required: true, min: 0, max: 100000 },
  },
  { timestamps: true }
)

habitLogSchema.index({ userId: 1, habitId: 1, day: 1 }, { unique: true })
habitLogSchema.index({ userId: 1, day: 1 })
habitLogSchema.plugin(tenantGuard)

export const HabitLog = mongoose.model('HabitLog', habitLogSchema)
