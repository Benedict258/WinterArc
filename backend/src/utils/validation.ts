import { z } from 'zod';

// NOTE: no `.default()` on any field. zod v4 applies defaults even inside
// `.partial()`, which would silently overwrite existing values on PUT.
// Mongoose model defaults cover missing fields on create.

const priorityEnum = z.enum(['low', 'medium', 'high']);
const intensityEnum = z.enum(['light', 'medium', 'heavy']);
const httpUrl = z.string().trim().url().refine(u => /^https?:\/\//i.test(u), 'URL must start with http:// or https://');

// Thread validation schema
export const threadSchema = z.object({
  name: z.string().trim().min(1, 'Thread name is required'),
  category: z.enum(['Role/Program', 'Active Build', 'Learning Track', 'Application/Outreach', 'Other']).optional(),
  frequency: z.enum(['daily', 'multiple', 'weekly', 'fixed-day']),
  // 0 = Monday … 6 = Sunday
  fixedDay: z.number().int().min(0).max(6).optional().nullable(),
  status: z.enum(['active', 'parked', 'archived']).optional(),
  priority: priorityEnum.optional(),
  intensity: intensityEnum.optional(),
  taskMode: z.enum(['discrete', 'continuous']).optional(),
  notes: z.string().optional().nullable(),
});
export const threadUpdateSchema = threadSchema.partial();

export const threadResourceSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  url: httpUrl,
  description: z.string().optional(),
  kind: z.enum(['link', 'resource']).optional(),
});

// Task validation schema
export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required'),
  threadId: z.string().nullable().optional(),
  date: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  timeBlock: z.enum(['morning', 'afternoon', 'evening', 'unscheduled']).optional(),
  status: z.enum(['pending', 'done', 'skipped']).optional(),
  completedAt: z.string().optional().nullable(),
  priority: priorityEnum.optional(),
  intensity: intensityEnum.optional(),
  calendarEventId: z.string().optional().nullable(),
  source: z.enum(['manual', 'auto-generated', 'google-calendar']).optional(),
});
export const taskUpdateSchema = taskSchema.partial();

// WishlistItem validation schema
export const wishlistItemSchema = z.object({
  item: z.string().trim().min(1, 'Item name is required'),
  note: z.string().optional().nullable(),
  acquired: z.boolean().optional(),
});
export const wishlistItemUpdateSchema = wishlistItemSchema.partial();

// Goal validation schema
export const goalSchema = z.object({
  period: z.string().trim().min(1, 'Period is required'),
  text: z.string().trim().min(1, 'Goal text is required'),
});
export const goalUpdateSchema = goalSchema.partial();

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

export const settingsSchema = z.object({
  timezone: z.string().refine(tz => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
  }, 'Invalid timezone'),
  weeklyGenerationRules: z.any().optional(),
  multipleThreadsPerWeekTarget: z.number().int().min(1).max(7),
  gridBalancing: gridBalancingSchema.optional(),
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
    s3Key: z.string().regex(/^drop\/[0-9a-f-]{36}-[a-zA-Z0-9._-]+$/, 'Invalid s3Key'),
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

export const loginSchema = z.object({
  passcode: z.string().min(1).max(256),
});

export type ThreadInput = z.infer<typeof threadSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type WishlistItemInput = z.infer<typeof wishlistItemSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type CalendarSyncInput = z.infer<typeof calendarSyncSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type GridBalancingInput = z.infer<typeof gridBalancingSchema>;
