import mongoose from 'mongoose'

// Beta sign-up codes. `remaining` counts down so a code can't be over-used
// even when two people sign up at the same moment.
const inviteCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    maxUses: { type: Number, default: 1, min: 1 },
    remaining: { type: Number, default: 1, min: 0 },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    note: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export const InviteCode = mongoose.model('InviteCode', inviteCodeSchema)
