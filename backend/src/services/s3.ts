import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Object storage for Drop. Works with AWS S3 or any S3-compatible provider
 * (Cloudflare R2, Backblaze B2, MinIO, …) — set S3_ENDPOINT for non-AWS.
 *
 *   S3_DROP_BUCKET          bucket name (required)
 *   S3_ACCESS_KEY_ID        or AWS_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY    or AWS_SECRET_ACCESS_KEY
 *   S3_REGION               or AWS_REGION (default us-east-1; R2 uses "auto")
 *   S3_ENDPOINT             e.g. https://<account>.r2.cloudflarestorage.com
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

  const client = new S3Client({
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
    // SDK >= 3.729 otherwise signs a CRC32 of the *empty* body into presigned
    // PUT URLs, so every real browser upload fails the checksum (and R2/B2
    // reject the extra params outright).
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
  if (cached === undefined) cached = readConfig()
  return cached !== null
}

/** Test helper: re-read env vars on next use. */
export function resetStorageConfig() {
  cached = undefined
}

export const getPresignedPutUrl = async (key: string, contentType?: string, expiresIn = 300) => {
  const { client, bucket } = getStorage()
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType })
  return await getSignedUrl(client, command, { expiresIn })
}

export const getPresignedGetUrl = async (key: string, expiresIn = 300) => {
  const { client, bucket } = getStorage()
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  return await getSignedUrl(client, command, { expiresIn })
}

export const deleteS3Object = async (key: string) => {
  const { client, bucket } = getStorage()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
