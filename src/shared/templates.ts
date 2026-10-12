// Starter packs for onboarding. Plain data, shared by the server (applies them) and the wizard (previews them).
import type { DayBlock, Intensity } from './dayBlocks'

export type TemplateThread = {
  /** stable key within the template, used to say which threads the user kept */
  key: string
  name: string
  category: 'Role/Program' | 'Active Build' | 'Learning Track' | 'Application/Outreach' | 'Other'
  frequency: 'daily' | 'multiple' | 'weekly' | 'fixed-day'
  /** 0 = Monday … 6 = Sunday */
  fixedDay?: number
  priority: 'low' | 'medium' | 'high'
  intensity: Intensity
  taskMode: 'discrete' | 'continuous' | 'event'
  eventStart?: string
  eventEnd?: string
  eventDays?: number[]
  notes?: string
  /** off by default (e.g. events whose time is a guess) */
  optional?: boolean
}

export type TemplateTask = { thread?: string; title: string; intensity: Intensity }

export type Template = {
  id: string
  name: string
  tagline: string
  /** lucide icon name */
  icon: string
  blocks: DayBlock[]
  /** planner preset suggested for this pack */
  preset: PresetId
  threads: TemplateThread[]
  tasks: TemplateTask[]
}

export type PresetId = 'relaxed' | 'balanced' | 'strict'

export const PRESETS: Record<PresetId, { label: string; blurb: string; maxDailyIntensity: number; backlogPerDay: number }> = {
  relaxed: { label: 'Relaxed', blurb: 'Light days, little backlog pulled in', maxDailyIntensity: 4, backlogPerDay: 1 },
  balanced: { label: 'Balanced', blurb: 'A steady day with some catching up', maxDailyIntensity: 6, backlogPerDay: 2 },
  strict: { label: 'Strict', blurb: 'Full days, backlog cleared steadily', maxDailyIntensity: 8, backlogPerDay: 3 },
}

const w = (light: number, medium: number, heavy: number) => ({ light, medium, heavy })
const block = (id: string, label: string, start: number, weights: DayBlock['weights']): DayBlock => ({ id, label, start, weights })

const DAYS_WEEK = [0, 1, 2, 3, 4]

export const TEMPLATES: Template[] = [
  {
    id: 'student',
    name: 'Student',
    tagline: 'Classes, study sessions, assignments and revision',
    icon: 'GraduationCap',
    preset: 'balanced',
    blocks: [
      block('morning', 'Morning', 6, w(1, 0, 3)),
      block('midday', 'Midday', 11, w(0, 1, 3)),
      block('afternoon', 'Afternoon', 15, w(0, 0, 1)),
      block('evening', 'Evening', 19, w(1, 1, 0)),
    ],
    threads: [
      { key: 'study', name: 'Study sessions', category: 'Learning Track', frequency: 'daily', priority: 'high', intensity: 'heavy', taskMode: 'continuous' },
      { key: 'assignments', name: 'Assignments & deadlines', category: 'Role/Program', frequency: 'multiple', priority: 'high', intensity: 'medium', taskMode: 'discrete' },
      { key: 'reading', name: 'Reading', category: 'Learning Track', frequency: 'multiple', priority: 'medium', intensity: 'light', taskMode: 'continuous' },
      { key: 'revision', name: 'Weekly revision', category: 'Learning Track', frequency: 'fixed-day', fixedDay: 6, priority: 'medium', intensity: 'heavy', taskMode: 'continuous' },
      { key: 'wellbeing', name: 'Exercise & rest', category: 'Other', frequency: 'multiple', priority: 'low', intensity: 'light', taskMode: 'continuous' },
      { key: 'lectures', name: 'Lectures', category: 'Role/Program', frequency: 'weekly', priority: 'medium', intensity: 'medium', taskMode: 'event', eventStart: '10:00', eventEnd: '12:00', eventDays: DAYS_WEEK, optional: true, notes: 'Adjust the days and times to your timetable.' },
    ],
    tasks: [
      { thread: 'assignments', title: 'List this term\'s courses and deadlines', intensity: 'light' },
      { thread: 'study', title: 'Draft a weekly study timetable', intensity: 'medium' },
    ],
  },
  {
    id: 'developer',
    name: 'Developer',
    tagline: 'Deep work on a build, learning, applications and a weekly review',
    icon: 'Code2',
    preset: 'balanced',
    blocks: [
      block('morning', 'Deep work', 6, w(2, 0, 0)),
      block('midday', 'Midday', 12, w(0, 1, 3)),
      block('afternoon', 'Afternoon', 15, w(0, 0, 2)),
      block('evening', 'Evening', 19, w(0, 1, 1)),
    ],
    threads: [
      { key: 'build', name: 'Main project', category: 'Active Build', frequency: 'daily', priority: 'high', intensity: 'heavy', taskMode: 'continuous' },
      { key: 'learning', name: 'Learning track', category: 'Learning Track', frequency: 'multiple', priority: 'medium', intensity: 'medium', taskMode: 'continuous' },
      { key: 'applications', name: 'Applications & outreach', category: 'Application/Outreach', frequency: 'multiple', priority: 'medium', intensity: 'medium', taskMode: 'discrete' },
      { key: 'side', name: 'Side project', category: 'Active Build', frequency: 'weekly', priority: 'low', intensity: 'medium', taskMode: 'continuous' },
      { key: 'admin', name: 'Code review & admin', category: 'Other', frequency: 'multiple', priority: 'low', intensity: 'light', taskMode: 'discrete' },
      { key: 'review', name: 'Weekly review', category: 'Other', frequency: 'fixed-day', fixedDay: 6, priority: 'medium', intensity: 'light', taskMode: 'continuous' },
    ],
    tasks: [
      { thread: 'build', title: 'Write down the next three milestones', intensity: 'medium' },
      { thread: 'applications', title: 'Shortlist five roles to apply for', intensity: 'light' },
    ],
  },
  {
    id: 'fitness',
    name: 'Fitness',
    tagline: 'Training, cardio, mobility, meal prep and progress check-ins',
    icon: 'Dumbbell',
    preset: 'relaxed',
    blocks: [
      block('morning', 'Morning', 5, w(0, 1, 2)),
      block('midday', 'Midday', 11, w(0, 0, 3)),
      block('evening', 'Evening', 17, w(1, 1, 0)),
    ],
    threads: [
      { key: 'strength', name: 'Strength training', category: 'Active Build', frequency: 'multiple', priority: 'high', intensity: 'heavy', taskMode: 'continuous' },
      { key: 'cardio', name: 'Cardio', category: 'Active Build', frequency: 'multiple', priority: 'medium', intensity: 'medium', taskMode: 'continuous' },
      { key: 'mobility', name: 'Mobility & stretching', category: 'Other', frequency: 'daily', priority: 'low', intensity: 'light', taskMode: 'continuous' },
      { key: 'mealprep', name: 'Meal prep', category: 'Other', frequency: 'fixed-day', fixedDay: 6, priority: 'medium', intensity: 'medium', taskMode: 'continuous' },
      { key: 'recovery', name: 'Sleep & recovery check-in', category: 'Other', frequency: 'daily', priority: 'low', intensity: 'light', taskMode: 'continuous' },
      { key: 'progress', name: 'Weekly progress check', category: 'Other', frequency: 'fixed-day', fixedDay: 0, priority: 'medium', intensity: 'light', taskMode: 'discrete' },
    ],
    tasks: [
      { thread: 'strength', title: 'Choose a training split for the week', intensity: 'light' },
      { thread: 'progress', title: 'Record starting measurements', intensity: 'light' },
    ],
  },
  {
    id: 'creator',
    name: 'Creator',
    tagline: 'Making, publishing, engaging and learning, with a batching day',
    icon: 'Clapperboard',
    preset: 'balanced',
    blocks: [
      block('morning', 'Create', 6, w(2, 0, 0)),
      block('afternoon', 'Afternoon', 12, w(0, 1, 2)),
      block('evening', 'Publish & engage', 17, w(0, 1, 2)),
    ],
    threads: [
      { key: 'create', name: 'Creating', category: 'Active Build', frequency: 'daily', priority: 'high', intensity: 'heavy', taskMode: 'continuous' },
      { key: 'publish', name: 'Publishing', category: 'Application/Outreach', frequency: 'multiple', priority: 'high', intensity: 'medium', taskMode: 'discrete' },
      { key: 'engage', name: 'Engage with audience', category: 'Application/Outreach', frequency: 'daily', priority: 'low', intensity: 'light', taskMode: 'continuous' },
      { key: 'learn', name: 'Learn & get inspired', category: 'Learning Track', frequency: 'weekly', priority: 'low', intensity: 'light', taskMode: 'continuous' },
      { key: 'batch', name: 'Batch day', category: 'Active Build', frequency: 'fixed-day', fixedDay: 5, priority: 'medium', intensity: 'heavy', taskMode: 'continuous' },
      { key: 'analytics', name: 'Analytics & admin', category: 'Other', frequency: 'fixed-day', fixedDay: 4, priority: 'medium', intensity: 'medium', taskMode: 'discrete' },
    ],
    tasks: [
      { thread: 'create', title: 'Pick this month\'s three content themes', intensity: 'medium' },
      { thread: 'publish', title: 'Set a posting schedule', intensity: 'light' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank',
    tagline: 'Start empty and build your own threads',
    icon: 'FileText',
    preset: 'balanced',
    blocks: [
      block('morning', 'Morning', 6, w(1, 0, 4)),
      block('afternoon', 'Afternoon', 12, w(0, 1, 2)),
      block('evening', 'Evening', 17, w(1, 1, 0)),
    ],
    threads: [],
    tasks: [],
  },
]

export const getTemplate = (id: string) => TEMPLATES.find(t => t.id === id)
