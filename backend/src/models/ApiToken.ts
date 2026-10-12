import mongoose from 'mongoose'

// Long-lived login for the native app, which can't use the session cookie
// (its pages are served from a different origin than the API).
// Only a hash of the token is stored.
const apiTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  label: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
})

export const ApiToken = mongoose.model('ApiToken', apiTokenSchema)
