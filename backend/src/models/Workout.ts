import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'
import { WORKOUT_KINDS } from '../../../src/shared/fitness'

const setSchema = new mongoose.Schema(
  { reps: { type: Number, default: null }, weightKg: { type: Number, default: null }, seconds: { type: Number, default: null }, km: { type: Number, default: null } },
  { _id: false }
)
const exerciseSchema = new mongoose.Schema({ name: { type: String, required: true, maxlength: 60 }, sets: { type: [setSchema], default: [] } }, { _id: false })

const workoutSchema = new mongoose.Schema(
  {
    userId: tenantField,
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    title: { type: String, required: true, maxlength: 80 },
    kind: { type: String, enum: WORKOUT_KINDS, default: 'other' },
    minutes: { type: Number, default: null },
    km: { type: Number, default: null },
    calories: { type: Number, default: null },
    effort: { type: Number, default: null },
    notes: { type: String, default: '', maxlength: 2000 },
    exercises: { type: [exerciseSchema], default: [] },
    source: { type: String, enum: ['manual', 'assistant'], default: 'manual' },
  },
  { timestamps: true }
)

workoutSchema.index({ userId: 1, day: -1 })
workoutSchema.plugin(tenantGuard)

export const Workout = mongoose.model('Workout', workoutSchema)
