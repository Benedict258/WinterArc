import { S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

function getS3Client() {
  const region = process.env.AWS_REGION || 'us-east-1'
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const bucket = process.env.S3_DROP_BUCKET

  if (!accessKeyId || !secretAccessKey || !bucket) {
    console.warn('S3 Drop config missing: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_DROP_BUCKET')
  }

  return {
    client: new S3Client({
      region,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    }),
    bucket,
  }
}

export const getPresignedPutUrl = async (key: string, contentType?: string, expiresIn = 300) => {
  const { client, bucket } = getS3Client()
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType })
  return await getSignedUrl(client, command, { expiresIn })
}

export const getPresignedGetUrl = async (key: string, expiresIn = 300) => {
  const { client, bucket } = getS3Client()
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  return await getSignedUrl(client, command, { expiresIn })
}

export const deleteS3Object = async (key: string) => {
  const { client, bucket } = getS3Client()
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: key })
  await client.send(command)
}
