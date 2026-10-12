import { Router } from 'express'
import { z } from 'zod'
import { validateRequest } from '../middleware/validationMiddleware'
import { uid } from '../middleware/auth'
import { User } from '../models/User'
import { verifyPassword } from '../services/passwordService'
import { exportAccount, deleteAccount } from '../services/accountService'

export const accountRouter = Router()

const deleteSchema = z.object({
  /** required when the account has a password */
  password: z.string().max(256).optional(),
  /** always required: typing your email confirms you mean it */
  confirmEmail: z.string().trim().toLowerCase().max(254),
})

const handleExport: import('express').RequestHandler = async (req, res) => {
  try {
    const data = await exportAccount(uid(req))
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', 'attachment; filename="winterarc-export.json"')
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Export failed' })
  }
}
accountRouter.get('/export', handleExport)

accountRouter.post('/delete', validateRequest(deleteSchema), async (req, res) => {
  try {
    const user = await User.findOne({ _id: uid(req) })
    if (!user) return res.status(404).json({ error: 'Account not found' })
    if (user.role === 'admin') return res.status(403).json({ error: 'Admin accounts can’t be deleted here.' })
    if (req.body.confirmEmail !== user.email) return res.status(400).json({ error: 'Type your email address exactly to confirm.' })
    if (user.passwordHash && !(req.body.password && await verifyPassword(req.body.password, user.passwordHash))) {
      return res.status(403).json({ error: 'Incorrect password.' })
    }
    const summary = await deleteAccount(user.id)
    req.session?.destroy(() => {})
    res.json({ ok: true, ...summary })
  } catch (error) {
    console.error('Account deletion failed:', error instanceof Error ? error.message : error)
    res.status(500).json({ error: 'Deleting your account failed. Nothing more was changed that we know of; please try again.' })
  }
})
export { handleExport }
