import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

const habitSchema = new mongoose.Schema(
  {
    userId: tenantField,
    name: { type: String, required: true, maxlength: 60 },
    emoji: { type: String, default: '', maxlength: 8 },
    unit: { type: String, default: '', maxlength: 16 },
    // 0 = Sunday … 6 = Saturday: the days it is expected
    weekdays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    // counts that make a day "done" (1 = yes/no)
    target: { type: Number, default: 1, min: 1, max: 1000 },
    // 'YYYY-MM-DD' (the person's timezone) it was created, so earlier days aren't counted as misses
    startedOn: { type: String, required: true },
    archived: { type: Boolean, default: false },
    // longest run seen so far, and the highest milestone already celebrated for the current run
    bestStreak: { type: Number, default: 0 },
    lastMilestone: { type: Number, default: 0 },
    // first day of the run lastMilestone belongs to; a different run starts the count again
    milestoneRunStart: { type: String, default: null },
  },
  { timestamps: true }
)

habitSchema.index({ userId: 1, archived: 1, createdAt: 1 })
habitSchema.plugin(tenantGuard)

export const Habit = mongoose.model('Habit', habitSchema)
