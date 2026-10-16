import { Router } from 'express'
import { z } from 'zod'
import { validateRequest } from '../middleware/validationMiddleware'
import { uid } from '../middleware/auth'
import { HabitError, archiveHabit, checkIn, createHabit, deleteHabit, listHabits, monthlyOverview, updateHabit } from '../services/habitService'

export const habitsRouter = Router()

const fail = (res: any, error: unknown) => {
  if (error instanceof HabitError) return res.status(error.status).json({ error: error.message })
  console.error('Habits error:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}
const wrap = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => { try { res.json(await fn(req)) } catch (e) { fail(res, e) } }

const checkInSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  value: z.number().min(0).max(100000).optional(),
  add: z.number().min(-100000).max(100000).optional(),
}).refine(b => (b.value === undefined) !== (b.add === undefined), 'Send either value or add')

habitsRouter.get('/', wrap(req => listHabits(uid(req))))
habitsRouter.get('/monthly', wrap(req => monthlyOverview(uid(req))))
habitsRouter.post('/', wrap(req => createHabit(uid(req), req.body)))
habitsRouter.put('/:id', wrap(req => updateHabit(uid(req), req.params.id, req.body)))
habitsRouter.post('/:id/archive', wrap(req => archiveHabit(uid(req), req.params.id)))
habitsRouter.delete('/:id', wrap(req => deleteHabit(uid(req), req.params.id)))
habitsRouter.post('/:id/checkin', validateRequest(checkInSchema), wrap(req => checkIn(uid(req), req.params.id, req.body)))
