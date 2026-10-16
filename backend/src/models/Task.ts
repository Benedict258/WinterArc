import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

const taskSchema = new mongoose.Schema(
  {
    userId: tenantField,
    title: {
      type: String,
      required: true,
    },
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      default: null,
    },
    date: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    timeBlock: {
      // a block id from the user's day structure, or 'unscheduled'
      type: String,
      maxlength: 24,
      default: 'unscheduled',
    },
    status: {
      type: String,
      enum: ['pending', 'done', 'skipped'],
      default: 'pending',
    },
    completedAt: Date,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    intensity: {
      type: String,
      enum: ['light', 'medium', 'heavy'],
      default: 'medium',
    },
    // Events/sessions: fixed by the clock, 'HH:mm' in the user's timezone
    isEvent: { type: Boolean, default: false },
    startTime: { type: String, default: null },
    endTime: { type: String, default: null },
    // Tasks in a shared thread belong to whoever they're assigned to (userId); this is who created it, when someone else did
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Set when an unfinished task was swept off a past day (the day it was missed)
    missedOn: { type: Date, default: null },
    // Set on tasks a routine added: 'routineId:stepId', so adding the routine again doesn't duplicate them
    routineKey: { type: String, default: null, maxlength: 48 },
    calendarEventId: String,
    source: {
      type: String,
      enum: ['manual', 'auto-generated', 'google-calendar', 'import', 'routine'],
      default: 'manual',
    },
    // Set when the daily generator put this task on a day, so "Rebalance"
    // can undo exactly the generator's placements and leave yours alone.
    scheduledBy: {
      type: String,
      enum: ['generator', null],
      default: null,
    },
  },
  { timestamps: true }
)

taskSchema.index({ userId: 1, date: 1 })
taskSchema.index({ userId: 1, threadId: 1, date: 1 })
taskSchema.index({ userId: 1, status: 1, date: 1 })
taskSchema.index({ threadId: 1, status: 1 })
taskSchema.plugin(tenantGuard)

export const Task = mongoose.model('Task', taskSchema)
