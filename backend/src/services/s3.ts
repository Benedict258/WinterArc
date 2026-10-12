import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Object storage for Drop. Production uses Backblaze B2 through its
 * S3-compatible API; any S3-compatible provider works (R2, MinIO, AWS S3).
 *
 *   S3_DROP_BUCKET          bucket name (required)
 *   S3_ACCESS_KEY_ID        or AWS_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY    or AWS_SECRET_ACCESS_KEY
 *   S3_REGION               or AWS_REGION, e.g. us-west-004 for B2
 *   S3_ENDPOINT             e.g. https://s3.us-west-004.backblazeb2.com
 *   S3_FORCE_PATH_STYLE     "true" for MinIO-style endpoints
 */

type StorageConfig = {
  client: S3Client
  bucket: string
}

let cached: StorageConfig | null | undefined

function readConfig(): StorageConfig | null {
  const bucket = process.env.S3_DROP_BUCKET
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
  if (!bucket || !accessKeyId || !secretAccessKey) return null

  // B2 displays its endpoint without a scheme (s3.us-east-005.backblazeb2.com)
  const rawEndpoint = process.env.S3_ENDPOINT?.trim()
  const endpoint = rawEndpoint
    ? (/^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`)
    : undefined

  const client = new S3Client({
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
    // SDK >= 3.729 otherwise signs a CRC32 of the *empty* body into presigned
    // PUT URLs, so every real browser upload fails the checksum (B2 also
    // rejects the extra checksum params).
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return { client, bucket }
}

function getStorage(): StorageConfig {
  if (cached === undefined) cached = readConfig()
  if (!cached) throw new StorageNotConfiguredError()
  return cached
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('File storage is not configured (S3_DROP_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY)')
  }
}

export function isStorageConfigured() {
  if (override) return true
  if (cached === undefined) cached = readConfig()
  return cached !== null
}

/** Test helper: re-read env vars on next use. */
export function resetStorageConfig() {
  cached = undefined
}

export type StoredObject = { key: string; size: number; lastModified: Date }

/** What Drop needs from storage. Production is S3-compatible; tests swap in a fake. */
export type Storage = {
  presignPut(key: string, contentType?: string, expiresIn?: number): Promise<string>
  presignGet(key: string, expiresIn?: number): Promise<string>
  remove(key: string): Promise<void>
  /** null when the object isn't there */
  head(key: string): Promise<{ size: number } | null>
  list(prefix: string, continuationToken?: string): Promise<{ objects: StoredObject[]; next?: string }>
}

const s3Storage: Storage = {
  async presignPut(key, contentType, expiresIn = 300) {
    const { client, bucket } = getStorage()
    return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn })
  },
  async presignGet(key, expiresIn = 300) {
    const { client, bucket } = getStorage()
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn })
  },
  async remove(key) {
    const { client, bucket } = getStorage()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  },
  async head(key) {
    const { client, bucket } = getStorage()
    try {
      const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      return { size: Number(out.ContentLength ?? 0) }
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') return null
      throw error
    }
  },
  async list(prefix, continuationToken) {
    const { client, bucket } = getStorage()
    const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken, MaxKeys: 500 }))
    return {
      objects: (out.Contents ?? []).filter(o => o.Key).map(o => ({ key: o.Key!, size: Number(o.Size ?? 0), lastModified: o.LastModified ?? new Date() })),
      next: out.IsTruncated ? out.NextContinuationToken : undefined,
    }
  },
}

let override: Storage | null = null
/** Tests replace storage so nothing leaves the process. */
export const setStorage = (fake: Storage | null) => { override = fake }
const active = (): Storage => override ?? s3Storage

export const getPresignedPutUrl = (key: string, contentType?: string, expiresIn = 300) => active().presignPut(key, contentType, expiresIn)
export const getPresignedGetUrl = (key: string, expiresIn = 300) => active().presignGet(key, expiresIn)
export const deleteS3Object = (key: string) => active().remove(key)
export const headObject = (key: string) => active().head(key)
export const listObjects = (prefix: string, token?: string) => active().list(prefix, token)
