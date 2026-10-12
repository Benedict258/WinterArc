import express, { Router } from 'express'
import { validateRequest } from '../middleware/validationMiddleware'
import { uid } from '../middleware/auth'
import { ImportError, importTasks, importTasksSchema, importWinterArc, winterArcExportSchema } from '../services/importService'

export const importRouter = Router()

const fail = (res: any, error: unknown) => {
  if (error instanceof ImportError) return res.status(400).json({ error: error.message })
  console.error('Import failed:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'The import failed. Nothing more was changed that we know of; please try again.' })
}

// Rows already parsed from CSV, Todoist or Notion files
importRouter.post('/tasks', validateRequest(importTasksSchema), async (req, res) => {
  try {
    res.json(await importTasks(uid(req), req.body))
  } catch (error) {
    fail(res, error)
  }
})

// A whole WinterArc export file, which can be larger than the usual request limit
export const WINTERARC_IMPORT_PATH = '/api/import/winterarc'
importRouter.post('/winterarc', express.json({ limit: '8mb' }), validateRequest(winterArcExportSchema), async (req, res) => {
  try {
    res.json(await importWinterArc(uid(req), req.body, req.query.dryRun === '1'))
  } catch (error) {
    fail(res, error)
  }
})
