import { z } from 'zod';
import { blocksProblem } from '../../../src/shared/dayBlocks';
import { ACCENTS, MODULE_IDS, type ModuleId } from '../../../src/shared/appearance';

// NOTE: no `.default()` on any field. zod v4 applies defaults even inside
// `.partial()`, which would silently overwrite existing values on PUT.
// Mongoose model defaults cover missing fields on create.

const priorityEnum = z.enum(['low', 'medium', 'high']);
const intensityEnum = z.enum(['light', 'medium', 'heavy']);
// Client-generated Mongo ObjectId, so a record created offline keeps the same id once synced
const clientId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id');
const blockId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,23}$/, 'Invalid time block');
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
const httpUrl = z.string().trim().url().refine(u => /^https?:\/\//i.test(u), 'URL must start with http:// or https://');

// Thread validation schema
export const threadSchema = z.object({
  _id: clientId.optional(),
  name: z.string().trim().min(1, 'Thread name is required'),
  category: z.enum(['Role/Program', 'Active Build', 'Learning Track', 'Application/Outreach', 'Other']).optional(),
  frequency: z.enum(['daily', 'multiple', 'weekly', 'fixed-day']),
  // 0 = Monday … 6 = Sunday
  fixedDay: z.number().int().min(0).max(6).optional().nullable(),
  status: z.enum(['active', 'parked', 'archived']).optional(),
  priority: priorityEnum.optional(),
  intensity: intensityEnum.optional(),
  taskMode: z.enum(['discrete', 'continuous', 'event']).optional(),
  eventStart: clockTime.optional().nullable(),
  eventEnd: clockTime.optional().nullable(),
  eventDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  notes: z.string().optional().nullable(),
});
export const threadUpdateSchema = threadSchema.omit({ _id: true }).partial();

export const threadResourceSchema = z.object({
  _id: clientId.optional(),
  title: z.string().trim().min(1, 'title is required'),
  url: httpUrl,
  description: z.string().optional(),
  kind: z.enum(['link', 'resource']).optional(),
});

// Task validation schema
export const taskSchema = z.object({
  _id: clientId.optional(),
  title: z.string().trim().min(1, 'Task title is required'),
  threadId: z.string().nullable().optional(),
  date: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  timeBlock: blockId.optional(),
  status: z.enum(['pending', 'done', 'skipped']).optional(),
  completedAt: z.string().optional().nullable(),
  priority: priorityEnum.optional(),
  intensity: intensityEnum.optional(),
  isEvent: z.boolean().optional(),
  startTime: clockTime.optional().nullable(),
  endTime: clockTime.optional().nullable(),
  calendarEventId: z.string().optional().nullable(),
  source: z.enum(['manual', 'auto-generated', 'google-calendar']).optional(),
});
export const taskUpdateSchema = taskSchema.omit({ _id: true }).partial();

// WishlistItem validation schema
export const wishlistItemSchema = z.object({
  _id: clientId.optional(),
  item: z.string().trim().min(1, 'Item name is required'),
  note: z.string().optional().nullable(),
  acquired: z.boolean().optional(),
});
export const wishlistItemUpdateSchema = wishlistItemSchema.omit({ _id: true }).partial();

// Goal validation schema
export const goalSchema = z.object({
  _id: clientId.optional(),
  period: z.string().trim().min(1, 'Period is required'),
  text: z.string().trim().min(1, 'Goal text is required'),
});
export const goalUpdateSchema = goalSchema.omit({ _id: true }).partial();

// CalendarSync validation schema
export const calendarSyncSchema = z.object({
  googleAccountId: z.string().optional().nullable(),
  accessToken: z.string().optional().nullable(),
  refreshToken: z.string().optional().nullable(),
  lastSyncedAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});
export const calendarSyncUpdateSchema = calendarSyncSchema.partial();

// Settings validation schema
export const gridBalancingSchema = z.object({
  maxDailyIntensity: z.number().int().min(1).max(20),
  preferLowIntensityOnBusyDays: z.boolean(),
});
export const gridBalancingUpdateSchema = gridBalancingSchema.partial();

export const notificationSettingsSchema = z.object({
  dailyPlan: z.object({ enabled: z.boolean(), time: clockTime }),
  dueTasks: z.object({ enabled: z.boolean() }),
  eventReminders: z.object({ enabled: z.boolean(), minutesBefore: z.number().int().min(0).max(240) }),
  emailDigest: z.object({ enabled: z.boolean(), time: clockTime }).optional(),
  habits: z.object({ enabled: z.boolean(), time: clockTime }).optional(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});

export const plannerSettingsSchema = z.object({
  rollover: z.boolean(),
  makeup: z.boolean(),
  backlogPerDay: z.number().int().min(0).max(5),
  dueWindowDays: z.number().int().min(0).max(14),
  blocks: z.array(z.any()).superRefine((blocks, ctx) => {
    const problem = blocksProblem(blocks)
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  }),
}).partial();

export const appearanceSchema = z.object({
  mode: z.enum(['dark', 'light', 'system']),
  accent: z.enum(ACCENTS.map(a => a.id) as [string, ...string[]]),
  density: z.enum(['comfortable', 'compact']),
}).partial();
export const modulesSchema = z.object(Object.fromEntries(MODULE_IDS.map(id => [id, z.boolean()])) as Record<ModuleId, z.ZodBoolean>).partial();

export const focusPrefsSchema = z.object({
  focusMin: z.number().int().min(1).max(180), shortMin: z.number().int().min(1).max(60), longMin: z.number().int().min(1).max(120),
  longEvery: z.number().int().min(2).max(10), autoStart: z.boolean(),
}).partial();

export const fitnessPrefsSchema = z.object({
  stepGoal: z.number().int().min(500).max(100000), weeklyWorkouts: z.number().int().min(1).max(14), units: z.enum(['metric', 'imperial']),
}).partial();

export const nutritionGoalsSchema = z.object({
  calories: z.number().int().min(1000).max(6000), proteinG: z.number().int().min(0).max(500),
  carbsG: z.number().int().min(0).max(1000).nullable(), fatG: z.number().int().min(0).max(500).nullable(),
  mode: z.enum(['none', 'lose', 'maintain', 'gain']), diet: z.string().trim().max(80), avoid: z.string().trim().max(200),
}).partial();

export const settingsSchema = z.object({
  timezone: z.string().refine(tz => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
  }, 'Invalid timezone'),
  weeklyGenerationRules: z.any().optional(),
  multipleThreadsPerWeekTarget: z.number().int().min(1).max(7),
  gridBalancing: gridBalancingSchema.optional(),
  notifications: notificationSettingsSchema.optional(),
  planner: plannerSettingsSchema.optional(),
  appearance: appearanceSchema.optional(),
  modules: modulesSchema.optional(),
  focus: focusPrefsSchema.optional(),
  fitness: fitnessPrefsSchema.optional(),
  nutrition: nutritionGoalsSchema.optional(),
});
export const settingsUpdateSchema = settingsSchema.partial();

// Drop validation schemas
export const dropUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  fileSize: z.number().int().nonnegative(),
});

export const dropItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('file'),
    s3Key: z.string().regex(/^drop\/[0-9a-f]{24}\/[0-9a-f-]{36}-[a-zA-Z0-9._-]+$/, 'Invalid s3Key'),
    fileName: z.string().min(1).max(255),
    fileSize: z.number().int().nonnegative(),
    mimeType: z.string().min(1).max(255),
  }),
  z.object({ type: z.literal('text'), textContent: z.string().min(1).max(100_000) }),
  z.object({ type: z.literal('link'), textContent: httpUrl }),
]);

export const dropUpdateSchema = z.object({
  expiresAt: z.string().refine(s => !Number.isNaN(Date.parse(s)), 'Invalid date'),
});

const emailField = z.string().trim().toLowerCase().email().max(254);
const passwordField = z.string().min(1).max(128);

export const signupSchema = z.object({
  email: emailField,
  password: passwordField,
  name: z.string().trim().max(80).optional(),
  inviteCode: z.string().trim().max(64).optional(),
  acceptTerms: z.literal(true, { error: 'Please accept the terms and privacy policy to create an account.' }),
  timezone: z.string().max(64).refine(tz => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
  }, 'Invalid timezone').optional(),
  client: z.enum(['web', 'native']).optional(),
});

export const loginSchema = z.object({
  email: emailField,
  password: passwordField,
  // 'native' asks for a bearer token instead of a session cookie
  client: z.enum(['web', 'native']).optional(),
});

export const googleLoginSchema = z.object({
  credential: z.string().min(10).max(4096),
  inviteCode: z.string().trim().max(64).optional(),
  acceptTerms: z.boolean().optional(),
  timezone: z.string().max(64).optional(),
  client: z.enum(['web', 'native']).optional(),
});

export const tokenSchema = z.object({ token: z.string().min(16).max(256) });
export const forgotPasswordSchema = z.object({ email: emailField });
export const resetPasswordSchema = z.object({ token: z.string().min(16).max(256), password: passwordField });

export type ThreadInput = z.infer<typeof threadSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type WishlistItemInput = z.infer<typeof wishlistItemSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type CalendarSyncInput = z.infer<typeof calendarSyncSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type GridBalancingInput = z.infer<typeof gridBalancingSchema>;

export const onboardingSchema = z.object({
  templateId: z.string().min(1).max(40),
  threads: z.array(z.string().min(1).max(40)).max(40).optional(),
  blocks: z.array(z.any()).superRefine((blocks, ctx) => {
    const problem = blocksProblem(blocks)
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  }).optional(),
  preset: z.enum(['relaxed', 'balanced', 'strict']).optional(),
  timezone: z.string().refine(tz => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
  }, 'Invalid timezone').optional(),
});
