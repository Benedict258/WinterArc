/**
 * One-off cleanup after switching from the old weekly generator
 * (gridService.generateWeek) to the daily rolling generator.
 *
 * The old generator pre-filled whole weeks with "auto-generated" tasks titled
 * with the bare thread name. Those tasks for today and later would sit next
 * to the new schedule/forecast as duplicates. This removes the ones that are
 * still pending; completed/skipped tasks and anything you created are kept.
 *
 *   npx tsx backend/src/scripts/cleanupLegacyGrid.ts           # dry run (read-only)
 *   npx tsx backend/src/scripts/cleanupLegacyGrid.ts --apply   # delete
 *
 * Run it BEFORE restarting the server on the new code, so today's schedule is
 * generated fresh.
 */
import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'
import { Task } from '../models/Task'
import { Settings } from '../models/Settings'
import { toDayKey, dayKeyToDate, DEFAULT_TIMEZONE } from '../services/dailyGenerationService'

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim()
  }
}

async function main() {
  loadEnv()
  const apply = process.argv.includes('--apply')
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set')

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 })
  try {
    const settings = await Settings.findOne()
    const timezone = settings?.timezone || DEFAULT_TIMEZONE
    const todayKey = toDayKey(new Date(), timezone)

    // If the new generator already committed today, keep today's tasks
    const fromKey = settings?.lastGeneratedDate === todayKey
      ? toDayKey(new Date(Date.now() + 86400000), timezone)
      : todayKey

    const filter = {
      source: 'auto-generated',
      status: 'pending',
      date: { $gte: dayKeyToDate(fromKey) },
    }
    const tasks = await Task.find(filter).sort({ date: 1 })

    const byDay = new Map<string, number>()
    for (const t of tasks) {
      const k = new Date(t.date!).toISOString().slice(0, 10)
      byDay.set(k, (byDay.get(k) ?? 0) + 1)
    }
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name}`)
    console.log(`Pending auto-generated tasks dated ${fromKey} or later: ${tasks.length}`)
    for (const [day, n] of byDay) console.log(`  ${day}: ${n}`)

    if (!apply) {
      console.log('\nDry run — nothing deleted. Re-run with --apply to delete them.')
      return
    }
    const result = await Task.deleteMany({ _id: { $in: tasks.map(t => t._id) } })
    console.log(`\nDeleted ${result.deletedCount} tasks.`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
