import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
} = process.env

function getR2Endpoint() {
  if (R2_ENDPOINT) return R2_ENDPOINT
  if (R2_ACCOUNT_ID) return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  return null
}

function getS3Client() {
  const endpoint = getR2Endpoint()
  if (!endpoint || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
}

export async function uploadPdfToR2({ bucket, key, body }) {
  return uploadBinaryToR2({ bucket, key, body, contentType: "application/pdf" })
}

export async function uploadBinaryToR2({ bucket, key, body, contentType = "application/octet-stream" }) {
  const client = getS3Client()
  if (!client) throw new Error("R2 credentials are not configured.")
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))
  return key
}

export async function getJsonFromR2({ bucket, key }) {
  const client = getS3Client()
  if (!client) return null
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const text = await res.Body.transformToString("utf-8")
    return JSON.parse(text)
  } catch (err) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) return null
    throw err
  }
}

export async function putJsonToR2({ bucket, key, data }) {
  return uploadBinaryToR2({ bucket, key, body: JSON.stringify(data, null, 2), contentType: "application/json" })
}

export async function getBinaryFromR2({ bucket, key }) {
  const client = getS3Client()
  if (!client) return null
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const chunks = []
    for await (const chunk of res.Body) chunks.push(chunk)
    return { body: Buffer.concat(chunks), contentType: res.ContentType || "application/octet-stream" }
  } catch (err) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) return null
    throw err
  }
}

export async function r2ObjectExists({ bucket, key }) {
  const client = getS3Client()
  if (!client) return false
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (err) {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) return false
    throw err
  }
}
