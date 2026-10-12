import mongoose from 'mongoose'
import { tenantField, tenantGuard } from '../plugins/tenant'

const wishlistItemSchema = new mongoose.Schema(
  {
    userId: tenantField,
    item: {
      type: String,
      required: true,
    },
    note: String,
    acquired: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
)

wishlistItemSchema.plugin(tenantGuard)

export const WishlistItem = mongoose.model('WishlistItem', wishlistItemSchema)
