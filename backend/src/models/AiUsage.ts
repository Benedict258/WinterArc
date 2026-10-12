import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

// Tokens the assistant used for one person in one calendar month (UTC), plus today's running total.
const aiUsageSchema = new mongoose.Schema(
  {
    userId: tenantField,
    month: { type: String, required: true }, // 'YYYY-MM'
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    requests: { type: Number, default: 0 },
    /** extra tokens an admin granted for this month */
    bonusTokens: { type: Number, default: 0 },
    dayKey: { type: String, default: null },
    dayTokens: { type: Number, default: 0 },
    moreRequestedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

aiUsageSchema.index({ userId: 1, month: 1 }, { unique: true })
aiUsageSchema.plugin(tenantGuard)

export const AiUsage = mongoose.model('AiUsage', aiUsageSchema)
