import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

// Body measurements for one day. Any field may be empty. `syncedFields` names the ones that came from the phone.
const bodyMetricSchema = new mongoose.Schema(
  {
    userId: tenantField,
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    weightKg: { type: Number, default: null },
    sleepHours: { type: Number, default: null },
    restingHr: { type: Number, default: null },
    waistCm: { type: Number, default: null },
    mood: { type: Number, default: null },
    syncedFields: { type: [String], default: [] },
  },
  { timestamps: true }
)

bodyMetricSchema.index({ userId: 1, day: 1 }, { unique: true })
bodyMetricSchema.plugin(tenantGuard)

export const BodyMetric = mongoose.model('BodyMetric', bodyMetricSchema)
