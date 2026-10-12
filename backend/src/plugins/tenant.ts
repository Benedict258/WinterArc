import mongoose, { type Schema } from 'mongoose'

// Multi-tenant safety net. Every user-owned model carries `userId`, and this
// plugin refuses to run any query that doesn't filter by it, so a route that
// forgets the filter fails loudly (and in tests) instead of leaking another
// user's data. Code that legitimately works across users (the daily scheduler,
// admin tools, account deletion) must opt in with `.setOptions({ crossUser: true })`.

export const tenantField = {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: true,
  index: true,
} as const

const OBJECT_ID = /^[0-9a-f]{24}$/i

/** A concrete id (ObjectId or its string form). `undefined`, `{}` and operators don't count. */
export function isUserIdValue(value: unknown): boolean {
  if (value instanceof mongoose.Types.ObjectId) return true
  return typeof value === 'string' && OBJECT_ID.test(value)
}

const QUERY_OPS = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany',
  'countDocuments', 'distinct',
] as const

export function assertTenantFilter(model: string, op: string, filter: Record<string, unknown> | undefined, options: Record<string, unknown> | undefined) {
  if (options?.crossUser) return
  if (!isUserIdValue(filter?.userId)) {
    throw new Error(`Tenant guard: ${model}.${op}() must filter by userId (or opt in with crossUser)`)
  }
}

export function tenantGuard(schema: Schema) {
  for (const op of QUERY_OPS) {
    schema.pre(op, { document: false, query: true }, function (this: any) {
      assertTenantFilter(this.model.modelName, op, this.getFilter?.(), this.getOptions?.())
    })
  }
  schema.pre('aggregate', function (this: any) {
    const first = this.pipeline()[0]?.$match
    assertTenantFilter(this.model().modelName, 'aggregate', first, this.options)
  })
  // Declares `next`, so Mongoose waits for it: it must always be called
  schema.pre('insertMany', function (next: (error?: Error) => void, docs: any) {
    const list = Array.isArray(docs) ? docs : [docs]
    for (const d of list) {
      if (!isUserIdValue(d?.userId)) return next(new Error('Tenant guard: insertMany() documents need a userId'))
    }
    next()
  })
}
