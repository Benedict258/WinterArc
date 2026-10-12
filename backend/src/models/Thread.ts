import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    description: { type: String, default: '' },
    kind: { type: String, enum: ['link', 'resource'], default: 'link' },
  },
  { timestamps: true }
)

const threadSchema = new mongoose.Schema(
  {
    userId: tenantField,
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['Role/Program', 'Active Build', 'Learning Track', 'Application/Outreach', 'Other'],
      default: 'Other',
    },
    frequency: {
      type: String,
      enum: ['daily', 'multiple', 'weekly', 'fixed-day'],
      required: true,
    },
    // 0 = Monday … 6 = Sunday
    fixedDay: {
      type: Number,
      min: 0,
      max: 6,
    },
    status: {
      type: String,
      enum: ['active', 'parked', 'archived'],
      default: 'active',
    },
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
    taskMode: {
      type: String,
      enum: ['discrete', 'continuous', 'event'],
      default: 'continuous',
    },
    // Event/session threads: wall-clock 'HH:mm' in the user's timezone, repeating on these weekdays (0 = Monday)
    eventStart: { type: String, default: null },
    eventEnd: { type: String, default: null },
    eventDays: { type: [Number], default: [] },
    notes: String,
    resources: [resourceSchema],
  },
  { timestamps: true }
)

threadSchema.index({ userId: 1, status: 1 })
threadSchema.plugin(tenantGuard)

export const Thread = mongoose.model('Thread', threadSchema)
