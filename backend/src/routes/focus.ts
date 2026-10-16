import { Router } from 'express'
import { z } from 'zod'
import { validateRequest } from '../middleware/validationMiddleware'
import { uid } from '../middleware/auth'
import { FocusError, deleteSession, getSummary, logSession } from '../services/focusService'
import { RoutineError, applyRoutine, createRoutine, deleteRoutine, listRoutines, updateRoutine } from '../services/routineService'

// Pomodoro history and routines. Both are part of the "Focus & routines" area.
export const focusRouter = Router()
export const routinesRouter = Router()

const fail = (res: any, error: unknown) => {
  if (error instanceof FocusError || error instanceof RoutineError) return res.status(error.status).json({ error: error.message })
  console.error('Focus error:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}
const wrap = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => { try { res.json(await fn(req)) } catch (e) { fail(res, e) } }

const sessionSchema = z.object({
  startedAt: z.string().max(40),
  minutes: z.number().int().min(1).max(180),
  taskId: z.string().regex(/^[0-9a-f]{24}$/i).nullable().optional(),
  label: z.string().max(80).optional(),
  clientId: z.string().max(40).optional(),
})

focusRouter.get('/summary', wrap(req => getSummary(uid(req))))
focusRouter.post('/sessions', validateRequest(sessionSchema), wrap(req => logSession(uid(req), req.body)))
focusRouter.delete('/sessions/:id', wrap(req => deleteSession(uid(req), req.params.id)))

// The body is checked by the shared routine rules in the service (one source of truth for the screens too)
routinesRouter.get('/', wrap(req => listRoutines(uid(req))))
routinesRouter.post('/', wrap(req => createRoutine(uid(req), req.body)))
routinesRouter.put('/:id', wrap(req => updateRoutine(uid(req), req.params.id, req.body)))
routinesRouter.delete('/:id', wrap(req => deleteRoutine(uid(req), req.params.id)))
routinesRouter.post('/:id/apply', wrap(req => applyRoutine(uid(req), req.params.id, req.body?.date)))
