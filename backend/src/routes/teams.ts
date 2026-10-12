import { Router } from 'express'
import { z } from 'zod'
import { validateRequest } from '../middleware/validationMiddleware'
import { uid } from '../middleware/auth'
import * as shared from '../services/sharedThreadService'

// Mounted behind requireVerified: invitations are matched on confirmed email addresses.
export const teamsRouter = Router()

const fail = (res: any, error: unknown) => {
  if (error instanceof shared.SharedError) return res.status(error.status).json({ error: error.message, ...error.extra })
  console.error('Teams error:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}
const wrap = (fn: (req: any) => Promise<unknown>, status = 200) => async (req: any, res: any) => { try { res.status(status).json(await fn(req)) } catch (e) { fail(res, e) } }

const role = z.enum(['editor', 'viewer'])
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)))
const oid = z.string().regex(/^[0-9a-f]{24}$/i)
const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), role })
const respondSchema = z.object({ action: z.enum(['accept', 'decline']) })
const roleSchema = z.object({ role })
const fields = {
  title: z.string().trim().min(1).max(200),
  dueDate: day.nullable(),
  priority: z.enum(['low', 'medium', 'high']),
  intensity: z.enum(['light', 'medium', 'heavy']),
  assigneeId: oid,
}
const createSchema = z.object({ title: fields.title, dueDate: fields.dueDate.optional(), priority: fields.priority.optional(), intensity: fields.intensity.optional(), assigneeId: fields.assigneeId.optional() })
const updateSchema = z.object({
  title: fields.title.optional(), dueDate: fields.dueDate.optional(), priority: fields.priority.optional(), intensity: fields.intensity.optional(),
  assigneeId: fields.assigneeId.optional(), status: z.enum(['pending', 'done']).optional(),
  expectedUpdatedAt: z.string().refine(s => !Number.isNaN(Date.parse(s))).optional(),
})

teamsRouter.get('/overview', wrap(async req => ({ sharedWithMe: await shared.threadsSharedWithMe(uid(req)), mine: await shared.mySharedThreads(uid(req)), invites: await shared.pendingInvites(uid(req)) })))
teamsRouter.post('/invitations/:memberId/respond', validateRequest(respondSchema), wrap(req => shared.respond(uid(req), req.params.memberId, req.body.action)))

teamsRouter.get('/:id', wrap(req => shared.listMembers(uid(req), req.params.id)))
teamsRouter.post('/:id/members', validateRequest(inviteSchema), wrap(req => shared.invite(uid(req), req.params.id, req.body.email, req.body.role)))
teamsRouter.put('/:id/members/:memberId', validateRequest(roleSchema), wrap(req => shared.setRole(uid(req), req.params.id, req.params.memberId, req.body.role)))
teamsRouter.delete('/:id/members/:memberId', wrap(req => shared.removeMember(uid(req), req.params.id, req.params.memberId)))

teamsRouter.get('/:id/tasks', wrap(req => shared.teamTasks(uid(req), req.params.id)))
teamsRouter.post('/:id/tasks', validateRequest(createSchema), wrap(req => shared.createTeamTask(uid(req), req.params.id, req.body), 201))
teamsRouter.put('/:id/tasks/:taskId', validateRequest(updateSchema), wrap(req => { const { expectedUpdatedAt, ...changes } = req.body; return shared.updateTeamTask(uid(req), req.params.id, req.params.taskId, changes, expectedUpdatedAt) }))
teamsRouter.delete('/:id/tasks/:taskId', wrap(req => shared.deleteTeamTask(uid(req), req.params.id, req.params.taskId)))
