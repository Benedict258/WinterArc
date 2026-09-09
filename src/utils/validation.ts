import { z } from 'zod';

// Thread validation schema
export const threadSchema = z.object({
  name: z.string().min(1, 'Thread name is required'),
  category: z.enum(['Role/Program', 'Active Build', 'Learning Track', 'Application/Outreach', 'Other']).default('Other'),
  frequency: z.enum(['daily', 'multiple', 'weekly', 'fixed-day']),
  fixedDay: z.number().int().min(0).max(6).optional(), // 0 = Monday, 6 = Sunday
  status: z.enum(['active', 'parked', 'archived']).default('active'),
  notes: z.string().optional(),
  taskType: z.enum(['discrete', 'continuous']).default('discrete'),
});

// Task validation schema
export const taskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  threadId: z.string().nullable().optional(), // ObjectId as string
  date: z.string(), // ISO date string
  dueDate: z.string().optional().nullable(),
  timeBlock: z.enum(['morning', 'afternoon', 'evening', 'unscheduled']).default('unscheduled'),
  status: z.enum(['pending', 'done', 'skipped']).default('pending'),
  completedAt: z.string().optional().nullable(),
  calendarEventId: z.string().optional(),
  source: z.enum(['manual', 'auto-generated', 'google-calendar']).default('manual'),
});

// WishlistItem validation schema
export const wishlistItemSchema = z.object({
  item: z.string().min(1, 'Item name is required'),
  note: z.string().optional(),
  acquired: z.boolean().default(false),
});

// Goal validation schema
export const goalSchema = z.object({
  period: z.string().min(1, 'Period is required'), // e.g., "Q4-2026"
  text: z.string().min(1, 'Goal text is required'),
});

// CalendarSync validation schema
export const calendarSyncSchema = z.object({
  googleAccountId: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  lastSyncedAt: z.string().optional(),
  expiresAt: z.string().optional(),
});

// Settings validation schema
export const settingsSchema = z.object({
  timezone: z.string().default('Africa/Lagos'),
  weeklyGenerationRules: z.any().optional(), // Using z.any() for Mixed type
  multipleThreadsPerWeekTarget: z.number().int().positive().default(3),
});

// Grid regeneration validation schema
export const gridRegenerateSchema = z.object({
  date: z.string().optional(),
});

// Calendar callback validation schema
export const calendarCallbackSchema = z.object({
  code: z.string(),
});

// Type inference exports
export type ThreadInput = z.infer<typeof threadSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type WishlistItemInput = z.infer<typeof wishlistItemSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type CalendarSyncInput = z.infer<typeof calendarSyncSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type GridRegenerateInput = z.infer<typeof gridRegenerateSchema>;
export type CalendarCallbackInput = z.infer<typeof calendarCallbackSchema>;
