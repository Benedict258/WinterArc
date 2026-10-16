import { Router } from 'express'
import { z } from 'zod'
import { validateRequest } from '../middleware/validationMiddleware'
import { uid } from '../middleware/auth'
import {
  FitnessError, createWorkout, deleteMetric, deleteWorkout, listWorkouts, overview, saveMetric, setManualSteps, syncFromDevice, updateWorkout,
} from '../services/fitnessService'

export const fitnessRouter = Router()

const fail = (res: any, error: unknown) => {
  if (error instanceof FitnessError) return res.status(error.status).json({ error: error.message })
  console.error('Fitness error:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}
const wrap = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => { try { res.json(await fn(req)) } catch (e) { fail(res, e) } }

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const nullableNum = z.number().nullable().optional()
const stepsSchema = z.object({ steps: z.number() })
const metricSchema = z.object({ weightKg: nullableNum, sleepHours: nullableNum, restingHr: nullableNum, waistCm: nullableNum, mood: nullableNum }).strict()
const syncSchema = z.object({
  steps: z.array(z.object({ day, steps: z.number() })).max(62).optional(),
  metrics: z.array(z.object({ day, weightKg: nullableNum, sleepHours: nullableNum, restingHr: nullableNum })).max(62).optional(),
})

fitnessRouter.get('/overview', wrap(req => overview(uid(req), Number(req.query.days) || 30)))
fitnessRouter.get('/workouts', wrap(req => listWorkouts(uid(req), Number(req.query.limit) || 50, typeof req.query.before === 'string' ? req.query.before : undefined)))
// The workout body is checked by the shared rules in the service (the screens use the same ones)
fitnessRouter.post('/workouts', wrap(req => createWorkout(uid(req), req.body)))
fitnessRouter.put('/workouts/:id', wrap(req => updateWorkout(uid(req), req.params.id, req.body)))
fitnessRouter.delete('/workouts/:id', wrap(req => deleteWorkout(uid(req), req.params.id)))
fitnessRouter.put('/steps/:day', validateRequest(stepsSchema), wrap(req => setManualSteps(uid(req), req.params.day, req.body.steps)))
fitnessRouter.post('/sync', validateRequest(syncSchema), wrap(req => syncFromDevice(uid(req), req.body)))
fitnessRouter.put('/metrics/:day', validateRequest(metricSchema), wrap(req => saveMetric(uid(req), req.params.day, req.body)))
fitnessRouter.delete('/metrics/:day', wrap(req => deleteMetric(uid(req), req.params.day)))
