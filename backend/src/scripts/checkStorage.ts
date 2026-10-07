/**
 * Verifies the Drop storage config end to end (works for Backblaze B2, R2,
 * S3, MinIO): presigned upload, presigned download, browser CORS preflight,
 * and delete — the same calls the app makes.
 *
 *   npm run storage:check                                   # uses .env
 *   npm run storage:check -- https://winterarc.benedictisaac.dev   # origin to test CORS for
 */
import * as fs from 'fs'
import * as path from 'path'
import { getPresignedPutUrl, getPresignedGetUrl, deleteS3Object, isStorageConfigured } from '../services/s3'

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim()
  }
}

let failed = false
function report(ok: boolean, label: string, detail = '') {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed = true
}

async function main() {
  loadEnv()
  const origin = process.argv[2] || (process.env.FRONTEND_ORIGIN || 'https://winterarc.benedictisaac.dev').split(',')[0].trim()

  if (!isStorageConfigured()) {
    report(false, 'Storage env vars', 'set S3_DROP_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_ENDPOINT/S3_REGION for B2)')
    process.exit(1)
  }
  console.log(`Bucket:   ${process.env.S3_DROP_BUCKET}`)
  console.log(`Endpoint: ${process.env.S3_ENDPOINT || '(AWS default)'}  region: ${process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1'}`)
  console.log(`Origin:   ${origin}\n`)

  const key = `drop/storage-check-${Date.now()}.txt`
  const body = `winterarc storage check ${new Date().toISOString()}`

  // 1. Browser preflight for the upload (what the Drop page triggers)
  const putUrl = await getPresignedPutUrl(key, 'text/plain', 300)
  try {
    const pre = await fetch(putUrl, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
    })
    const allowOrigin = pre.headers.get('access-control-allow-origin')
    report(pre.ok && (allowOrigin === origin || allowOrigin === '*'), 'CORS preflight for upload (PUT)',
      `status ${pre.status}, allow-origin ${allowOrigin ?? 'missing'}`)
  } catch (e) {
    report(false, 'CORS preflight for upload (PUT)', String(e))
  }

  // 2. Presigned upload
  try {
    const put = await fetch(putUrl, { method: 'PUT', body, headers: { 'Content-Type': 'text/plain', Origin: origin } })
    report(put.ok, 'Upload via presigned URL', put.ok ? '' : `${put.status} ${(await put.text()).slice(0, 300)}`)
  } catch (e) {
    report(false, 'Upload via presigned URL', String(e))
  }

  // 3. Presigned download (+ CORS header on the response, needed for image previews / downloads)
  try {
    const getUrl = await getPresignedGetUrl(key, 300)
    const get = await fetch(getUrl, { headers: { Origin: origin } })
    const text = await get.text()
    report(get.ok && text === body, 'Download via presigned URL', get.ok ? '' : `${get.status} ${text.slice(0, 300)}`)
    const allowOrigin = get.headers.get('access-control-allow-origin')
    report(allowOrigin === origin || allowOrigin === '*', 'CORS header on download', `allow-origin ${allowOrigin ?? 'missing'}`)
  } catch (e) {
    report(false, 'Download via presigned URL', String(e))
  }

  // 4. Delete
  try {
    await deleteS3Object(key)
    report(true, 'Delete object')
  } catch (e) {
    report(false, 'Delete object', String(e))
  }

  console.log(failed ? '\nStorage check FAILED — see DEPLOYMENT.md §4.' : '\nStorage is ready for Drop.')
  process.exit(failed ? 1 : 0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
