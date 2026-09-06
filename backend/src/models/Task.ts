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
    calendarEventId: String,
    source: {
      type: String,
      enum: ['manual', 'auto-generated', 'google-calendar'],
      default: 'manual',
    },
  },
  { timestamps: true }
)

export const Task = mongoose.model('Task', taskSchema)
