import { describe, it, expect } from 'vitest'
import { TEMPLATES, PRESETS } from './templates'
import { blocksProblem } from './dayBlocks'
import { threadSchema } from '../../backend/src/utils/validation'

describe('starter templates', () => {
  it('has the five packs', () => {
    expect(TEMPLATES.map(t => t.id)).toEqual(['student', 'developer', 'fitness', 'creator', 'blank'])
  })

  for (const t of TEMPLATES) {
    it(`${t.name}: valid day structure, threads and tasks`, () => {
      expect(blocksProblem(t.blocks)).toBeNull()
      expect(PRESETS[t.preset]).toBeDefined()
      const keys = t.threads.map(x => x.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const th of t.threads) {
        expect(threadSchema.safeParse({ name: th.name, category: th.category, frequency: th.frequency, fixedDay: th.fixedDay, priority: th.priority, intensity: th.intensity, taskMode: th.taskMode, eventStart: th.eventStart, eventEnd: th.eventEnd, eventDays: th.eventDays }).success).toBe(true)
        if (th.frequency === 'fixed-day') expect(th.fixedDay).toBeGreaterThanOrEqual(0)
        if (th.taskMode === 'event') expect(th.eventStart && th.eventEnd && th.eventDays?.length).toBeTruthy()
      }
      for (const task of t.tasks) if (task.thread) expect(keys).toContain(task.thread)
    })
  }
})
