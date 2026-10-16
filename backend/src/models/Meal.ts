import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'
import { MEAL_SLOTS } from '../../../src/shared/nutrition'

const itemSchema = new mongoose.Schema(
  { name: { type: String, required: true, maxlength: 80 }, calories: Number, proteinG: Number, carbsG: Number, fatG: Number },
  { _id: false }
)

// What someone ate, with estimated calories and macros.
const mealSchema = new mongoose.Schema(
  {
    userId: tenantField,
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    slot: { type: String, enum: MEAL_SLOTS, required: true },
    text: { type: String, required: true, maxlength: 300 },
    calories: { type: Number, required: true },
    proteinG: { type: Number, required: true },
    carbsG: { type: Number, required: true },
    fatG: { type: Number, required: true },
    items: { type: [itemSchema], default: [] },
    // typed by the person, estimated by the AI from a description, or logged through the chat
    source: { type: String, enum: ['manual', 'estimate', 'assistant'], default: 'manual' },
  },
  { timestamps: true }
)

mealSchema.index({ userId: 1, day: -1 })
mealSchema.plugin(tenantGuard)

export const Meal = mongoose.model('Meal', mealSchema)
