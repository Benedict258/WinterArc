import mongoose from 'mongoose'

const taskSchema = new mongoose.Schema(
  {
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
      type: String,
      enum: ['morning', 'afternoon', 'evening', 'unscheduled'],
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
    calendarEventId: String,
    source: {
      type: String,
      enum: ['manual', 'auto-generated', 'google-calendar'],
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

export const Task = mongoose.model('Task', taskSchema)
