import { Router } from 'express'
import { uid } from '../middleware/auth'
import { NutritionError, createMeal, deleteMeal, overview, updateMeal } from '../services/nutritionService'

export const nutritionRouter = Router()

const fail = (res: any, error: unknown) => {
  if (error instanceof NutritionError) return res.status(error.status).json({ error: error.message })
  console.error('Nutrition error:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}
const wrap = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => { try { res.json(await fn(req)) } catch (e) { fail(res, e) } }

nutritionRouter.get('/overview', wrap(req => overview(uid(req), Number(req.query.days) || 14)))
// Meal bodies are checked by the shared rules in the service (the screens use the same ones)
nutritionRouter.post('/meals', wrap(req => createMeal(uid(req), req.body, req.body?.source === 'estimate' ? 'estimate' : 'manual')))
nutritionRouter.put('/meals/:id', wrap(req => updateMeal(uid(req), req.params.id, req.body)))
nutritionRouter.delete('/meals/:id', wrap(req => deleteMeal(uid(req), req.params.id)))
