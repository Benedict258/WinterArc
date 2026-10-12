// Creates beta invite codes.
//   npm run invite:create -- --count 5 --uses 1 --days 30 --note "first testers"
import mongoose from 'mongoose'
import { InviteCode } from '../models/InviteCode'
import { inviteCodeString } from '../utils/tokens'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required')
  await mongoose.connect(process.env.MONGO_URI)
  const count = Number(arg('count', '1'))
  const uses = Number(arg('uses', '1'))
  const days = Number(arg('days', '0'))
  const note = arg('note', '')
  for (let i = 0; i < count; i++) {
    const doc = await InviteCode.create({
      code: inviteCodeString(), maxUses: uses, remaining: uses, note,
      expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000) : null,
    })
    console.log(doc.code)
  }
  await mongoose.disconnect()
}

main().catch(err => { console.error(err.message); process.exit(1) })
