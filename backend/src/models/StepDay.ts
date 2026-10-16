import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

// Steps for one day. `manual` is what the person typed; `synced` is what their phone or watch reported
// (Health Connect). The device count wins when both exist, because it includes every step.
const stepDaySchema = new mongoose.Schema(
  {
    userId: tenantField,
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    manual: { type: Number, default: null },
    synced: { type: Number, default: null },
  },
  { timestamps: true }
)

stepDaySchema.index({ userId: 1, day: 1 }, { unique: true })
stepDaySchema.plugin(tenantGuard)

export const StepDay = mongoose.model('StepDay', stepDaySchema)
