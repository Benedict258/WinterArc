import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

// One finished focus (Pomodoro) round. Breaks aren't recorded.
const focusSessionSchema = new mongoose.Schema(
  {
    userId: tenantField,
    startedAt: { type: Date, required: true },
    minutes: { type: Number, required: true, min: 1, max: 180 },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    label: { type: String, default: '', maxlength: 80 },
    // The device's own id for this round, so a retried upload isn't counted twice
    clientId: { type: String, maxlength: 40 },
  },
  { timestamps: true }
)

focusSessionSchema.index({ userId: 1, startedAt: -1 })
focusSessionSchema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } })
focusSessionSchema.plugin(tenantGuard)

export const FocusSession = mongoose.model('FocusSession', focusSessionSchema)
