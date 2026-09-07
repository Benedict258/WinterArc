import mongoose, { Schema, Document } from 'mongoose'

export interface IDropItem extends Document {
  type: 'file' | 'text' | 'link'
  s3Key: string | null
  fileName: string | null
  fileSize: number | null
  mimeType: string | null
  textContent: string | null
  createdAt: Date
  expiresAt: Date
}

const DropItemSchema = new Schema<IDropItem>({
  type: { type: String, enum: ['file', 'text', 'link'], required: true },
  s3Key: { type: String, default: null },
  fileName: { type: String, default: null },
  fileSize: { type: Number, default: null },
  mimeType: { type: String, default: null },
  textContent: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
})

DropItemSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const DropItem = mongoose.model<IDropItem>('DropItem', DropItemSchema)
