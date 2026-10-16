import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

// A one-time authorization code, waiting to be swapped for tokens. Only a hash is stored. Lives 5 minutes.
const oauthCodeSchema = new mongoose.Schema({
  userId: tenantField,
  codeHash: { type: String, required: true, unique: true },
  clientId: { type: String, required: true },
  redirectUri: { type: String, required: true },
  codeChallenge: { type: String, required: true },
  scopes: { type: [String], required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
})
oauthCodeSchema.plugin(tenantGuard)

export const OAuthCode = mongoose.model('OAuthCode', oauthCodeSchema)
