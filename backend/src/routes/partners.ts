import { Router } from 'express'
import { z } from 'zod'
import { validateRequest } from '../middleware/validationMiddleware'
import { uid } from '../middleware/auth'
import { PartnerError, cheer, invite, listPartners, partnerProgress, remove, respond, setSharing } from '../services/partnerService'

// Mounted behind requireVerified: partnerships are matched on confirmed email addresses.
export const partnersRouter = Router()

const fail = (res: any, error: unknown) => {
  if (error instanceof PartnerError) return res.status(error.status).json({ error: error.message })
  console.error('Partners error:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}
const wrap = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => { try { res.json(await fn(req)) } catch (e) { fail(res, e) } }

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) })
const respondSchema = z.object({ action: z.enum(['accept', 'decline', 'block']) })
const sharingSchema = z.object({ streak: z.boolean().optional(), weekProgress: z.boolean().optional(), threads: z.boolean().optional(), taskTitles: z.boolean().optional() })

partnersRouter.get('/', wrap(req => listPartners(uid(req))))
partnersRouter.post('/invite', validateRequest(inviteSchema), wrap(req => invite(uid(req), req.body.email)))
partnersRouter.post('/:id/respond', validateRequest(respondSchema), wrap(req => respond(uid(req), req.params.id, req.body.action)))
partnersRouter.delete('/:id', wrap(req => remove(uid(req), req.params.id)))
partnersRouter.put('/:id/sharing', validateRequest(sharingSchema), wrap(req => setSharing(uid(req), req.params.id, req.body)))
partnersRouter.get('/:id/progress', wrap(req => partnerProgress(uid(req), req.params.id)))
partnersRouter.post('/:id/cheer', wrap(req => cheer(uid(req), req.params.id)))
