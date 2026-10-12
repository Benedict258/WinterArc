import mongoose from 'mongoose'

// Someone invited to (or part of) a thread that another person owns. Not tenant-scoped: it belongs to the
// owner and the member, so sharedThreadService always checks which of the two the caller is.
const threadMemberSchema = new mongoose.Schema(
  {
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Thread', required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** null until the invitation is accepted (the person may not have an account yet) */
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    inviteeEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ['editor', 'viewer'], default: 'editor' },
    status: { type: String, enum: ['pending', 'active'], default: 'pending' },
  },
  { timestamps: true }
)

threadMemberSchema.index({ threadId: 1, inviteeEmail: 1 }, { unique: true })

export const ThreadMember = mongoose.model('ThreadMember', threadMemberSchema)
