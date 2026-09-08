import mongoose from 'mongoose'

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
      enum: ['discrete', 'continuous'],
      default: 'continuous',
    },
    notes: String,
    resources: [resourceSchema],
  },
  { timestamps: true }
)

export const Thread = mongoose.model('Thread', threadSchema)
