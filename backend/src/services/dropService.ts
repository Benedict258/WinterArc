import { DropItem } from '../models/DropItem'
import { deleteS3Object, headObject, listObjects, isStorageConfigured } from './s3'
import { getPlan } from './planService'
import { formatBytes } from '../../../src/shared/plans'

export class DropError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000
const live = () => ({ expiresAt: { $gt: new Date() } })

/** Bytes of files and number of items a person holds right now. Expired items no longer count. */
export async function getDropUsage(userId: string) {
  const [files, items] = await Promise.all([
    DropItem.aggregate([{ $match: { userId: new (DropItem.base.Types.ObjectId)(userId), type: 'file', ...live() } }, { $group: { _id: null, bytes: { $sum: '$fileSize' } } }]),
    DropItem.countDocuments({ userId, ...live() }),
  ])
  const { limits, plan } = await getPlan(userId)
  return {
    plan,
    usedBytes: (files[0]?.bytes as number) ?? 0,
    items,
    quotaBytes: limits.dropQuotaBytes,
    maxFileBytes: limits.dropMaxFileBytes,
    maxItems: limits.dropMaxItems,
  }
}

/** Before handing out an upload address: will this file fit? */
export async function assertCanUpload(userId: string, fileSize: number) {
  const u = await getDropUsage(userId)
  if (fileSize > u.maxFileBytes) throw new DropError(413, `Files can be up to ${formatBytes(u.maxFileBytes)} on your plan.`)
  if (u.items >= u.maxItems) throw new DropError(413, `You’ve reached ${u.maxItems} Drop items. Delete some to add more.`)
  if (u.usedBytes + fileSize > u.quotaBytes) {
    throw new DropError(413, `That would pass your ${formatBytes(u.quotaBytes)} Drop storage (${formatBytes(u.usedBytes)} used). Delete something or wait for items to expire.`)
  }
}

/** Text and links count toward the item limit only. */
export async function assertCanAddText(userId: string) {
  const u = await getDropUsage(userId)
  if (u.items >= u.maxItems) throw new DropError(413, `You’ve reached ${u.maxItems} Drop items. Delete some to add more.`)
}

/**
 * Register an uploaded file. The browser told us the size, but storage knows the truth, so the stored object is
 * measured and checked against the limits; if it doesn't fit it is deleted rather than kept.
 */
export async function registerFile(userId: string, input: { s3Key: string; fileName: string; mimeType: string; fileSize: number }, now = new Date()) {
  const stored = await headObject(input.s3Key)
  if (!stored) throw new DropError(400, 'The upload didn’t arrive. Try again.')
  try {
    await assertCanUpload(userId, stored.size)
  } catch (error) {
    await deleteS3Object(input.s3Key).catch(() => {})
    throw error
  }
  if (await DropItem.exists({ userId, s3Key: input.s3Key })) throw new DropError(409, 'That file is already in Drop.')
  return DropItem.create({
    userId, type: 'file', s3Key: input.s3Key, fileName: input.fileName, fileSize: stored.size, mimeType: input.mimeType,
    createdAt: now, expiresAt: new Date(now.getTime() + RETENTION_MS),
  })
}

export async function addTextItem(userId: string, type: 'text' | 'link', textContent: string, now = new Date()) {
  await assertCanAddText(userId)
  return DropItem.create({ userId, type, textContent, createdAt: now, expiresAt: new Date(now.getTime() + RETENTION_MS) })
}

/**
 * Remove stored files nothing points at: uploads that were never registered, and files whose Drop item
 * expired (Mongo removes the item on its own, the file stays). Files younger than a day are left alone
 * so a slow upload isn't deleted under its owner.
 */
export async function sweepDrop(now = new Date(), maxPages = 20): Promise<{ scanned: number; removed: number }> {
  if (!isStorageConfigured()) return { scanned: 0, removed: 0 }
  let token: string | undefined
  let scanned = 0
  let removed = 0
  for (let page = 0; page < maxPages; page++) {
    const { objects, next } = await listObjects('drop/', token)
    scanned += objects.length
    const old = objects.filter(o => now.getTime() - o.lastModified.getTime() > ORPHAN_GRACE_MS)
    if (old.length) {
      const known = new Set((await DropItem.find({ s3Key: { $in: old.map(o => o.key) }, ...live() }, { s3Key: 1 }).setOptions({ crossUser: true })).map(d => d.s3Key))
      for (const o of old) {
        if (known.has(o.key)) continue
        await deleteS3Object(o.key).catch(() => {})
        removed++
      }
    }
    if (!next) break
    token = next
  }
  return { scanned, removed }
}

let lastSweep = 0
/** At most every six hours per process; cheap to call from any scheduler tick. */
export async function sweepDropIfDue(now = new Date()) {
  if (now.getTime() - lastSweep < 6 * 3600_000) return null
  lastSweep = now.getTime()
  return sweepDrop(now).catch(err => { console.error('Drop sweep failed:', err instanceof Error ? err.message : err); return null })
}
export const resetSweepClock = () => { lastSweep = 0 }
