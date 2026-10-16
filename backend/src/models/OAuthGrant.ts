import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

// One app's access to one person's account: its current access and refresh tokens (hashes only) and what it may do.
// Revoking it (or deleting the account) ends the access at once.
const oauthGrantSchema = new mongoose.Schema(
  {
    userId: tenantField,
    clientId: { type: String, required: true },
    clientName: { type: String, required: true, maxlength: 80 },
    scopes: { type: [String], required: true },
    accessHash: { type: String, required: true, unique: true },
    accessExpiresAt: { type: Date, required: true },
    refreshHash: { type: String, required: true, unique: true },
    // the refresh token before the last rotation; presenting it again means it leaked, so the grant is revoked
    prevRefreshHash: { type: String, default: null, index: true },
    rotatedAt: { type: Date, default: null },
    refreshExpiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    calls: { type: Number, default: 0 },
  },
  { timestamps: true }
)
oauthGrantSchema.plugin(tenantGuard)

export const OAuthGrant = mongoose.model('OAuthGrant', oauthGrantSchema)
