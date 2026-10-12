import mongoose from 'mongoose'

// What admins did to whom. Holds ids, not personal data, so it can outlive a deleted account.
const auditLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: { type: String, required: true },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  detail: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true },
})

export const AuditLog = mongoose.model('AuditLog', auditLogSchema)
