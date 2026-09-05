import mongoose from 'mongoose'

const wishlistItemSchema = new mongoose.Schema(
  {
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

export const WishlistItem = mongoose.model('WishlistItem', wishlistItemSchema)
