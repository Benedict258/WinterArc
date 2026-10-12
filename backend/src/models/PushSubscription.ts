import mongoose from 'mongoose'

// One browser/device that agreed to receive Web Push.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: String,
  },
  { timestamps: true }
)

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema)
