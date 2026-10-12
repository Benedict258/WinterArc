import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true, default: '' },
    /** null for accounts that only use Google */
    passwordHash: { type: String, default: null },
    googleId: { type: String, default: null },
    emailVerifiedAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    /** bumped on password reset / "sign out everywhere"; sessions carrying an older value are rejected */
    sessionVersion: { type: Number, default: 0 },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    /** touched at most hourly; the schedulers only work for recently active users */
    lastSeenAt: { type: Date, default: null },
    /** set once the first-run setup (or skip) is finished */
    onboardedAt: { type: Date, default: null },
    signedUpWithCode: { type: String, default: null },
  },
  { timestamps: true }
)

userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } })

export const User = mongoose.model('User', userSchema)
