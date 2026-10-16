import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

const itemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, maxlength: 16 },
    title: { type: String, required: true, maxlength: 120 },
    startTime: { type: String, default: null },
    minutes: { type: Number, default: null },
    intensity: { type: String, enum: ['light', 'medium', 'heavy'], default: 'medium' },
  },
  { _id: false }
)

const routineSchema = new mongoose.Schema(
  {
    userId: tenantField,
    name: { type: String, required: true, maxlength: 60 },
    // 0 = Sunday … 6 = Saturday
    weekdays: { type: [Number], default: [] },
    // Add its steps to those weekdays automatically when the day is planned
    autoAdd: { type: Boolean, default: false },
    items: { type: [itemSchema], default: [] },
  },
  { timestamps: true }
)

routineSchema.plugin(tenantGuard)

export const Routine = mongoose.model('Routine', routineSchema)
