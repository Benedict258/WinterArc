import mongoose from 'mongoose'

// One payment from the billing provider. `reference` is unique, so a payment can only ever be applied once
// even when the webhook and the return page both report it.
const paymentSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, default: 'paystack' },
    months: { type: Number, required: true },
    amountMinor: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: ['pending', 'applied', 'failed'], default: 'pending' },
    paidAt: { type: Date, default: null },
    /** plan end after this payment was applied */
    planUntil: { type: Date, default: null },
  },
  { timestamps: true }
)

export const Payment = mongoose.model('Payment', paymentSchema)

/** Existence of a claim means that payment has been (or is being) applied. _id is the payment reference. */
export const PaymentClaim = mongoose.model('PaymentClaim', new mongoose.Schema({ _id: { type: String, required: true } }, { timestamps: true }))
