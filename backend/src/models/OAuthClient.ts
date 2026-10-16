import mongoose from 'mongoose'

// An app (Claude, ChatGPT, …) that registered itself to ask people for access (OAuth dynamic client registration).
// Public clients only: there is no secret, security comes from PKCE and exact redirect addresses.
// Not per-person data, so no tenant guard. Clients nobody has used for 45 days are removed.
const oauthClientSchema = new mongoose.Schema({
  clientId: { type: String, required: true, unique: true },
  name: { type: String, required: true, maxlength: 80 },
  redirectUris: { type: [String], required: true },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: Date.now, index: { expires: 45 * 24 * 3600 } },
})

export const OAuthClient = mongoose.model('OAuthClient', oauthClientSchema)
