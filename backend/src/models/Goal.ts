import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

const goalSchema = new mongoose.Schema(
  {
    userId: tenantField,
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

goalSchema.plugin(tenantGuard)

export const Goal = mongoose.model('Goal', goalSchema)
