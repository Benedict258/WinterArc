import mongoose from 'mongoose'

// One-time links sent by email (verify address, reset password). Only a hash is stored.
const emailTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['verify', 'reset'], required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: { type: Date, default: null },
})

export const EmailToken = mongoose.model('EmailToken', emailTokenSchema)
