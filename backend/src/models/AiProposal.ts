import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

// A change the assistant suggested. Nothing happens until the person approves it; the browser only
// ever sends the id back, so a suggestion can't be altered or forged on the way.
const aiProposalSchema = new mongoose.Schema(
  {
    userId: tenantField,
    kind: { type: String, required: true },
    args: { type: mongoose.Schema.Types.Mixed, required: true },
    summary: { type: String, required: true },
    details: { type: [String], default: [] },
    destructive: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'applying', 'applied', 'dismissed', 'failed'], default: 'pending' },
    result: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
)

aiProposalSchema.index({ userId: 1, status: 1 })
aiProposalSchema.plugin(tenantGuard)

export const AiProposal = mongoose.model('AiProposal', aiProposalSchema)
