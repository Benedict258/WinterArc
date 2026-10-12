import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

// One browser/device that agreed to receive Web Push.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: tenantField,
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: String,
  },
  { timestamps: true }
)

pushSubscriptionSchema.plugin(tenantGuard)

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema)
