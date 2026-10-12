import mongoose from 'mongoose'

// An accountability partnership between two people. Deliberately not tenant-scoped (it belongs to both),
// so every query in partnerService filters by "I am one of the two people".
const sharesSchema = new mongoose.Schema({
  streak: { type: Boolean, default: true },
  weekProgress: { type: Boolean, default: true },
  threads: { type: Boolean, default: false },
  taskTitles: { type: Boolean, default: false },
}, { _id: false })

const connectionSchema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** null until the invited person accepts (they may not have an account yet) */
    addresseeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    inviteeEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'blocked'], default: 'pending' },
    /** what the requester shares with the addressee, and the other way round */
    requesterShares: { type: sharesSchema, default: () => ({}) },
    addresseeShares: { type: sharesSchema, default: () => ({}) },
    cheers: { type: [{ by: mongoose.Schema.Types.ObjectId, at: Date }], default: [] },
  },
  { timestamps: true }
)

connectionSchema.index({ requesterId: 1, inviteeEmail: 1 }, { unique: true })

export const Connection = mongoose.model('Connection', connectionSchema)
