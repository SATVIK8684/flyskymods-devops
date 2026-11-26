/* =========================================================
   FlySkyMods - Cloudflare R2 file storage (S3-compatible)
   Mod files go straight from the browser to R2 using short-lived
   "signed URLs", so multi-GB files never pass through our server.
   Needs: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
   ========================================================= */
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Files up to this size are uploaded in one request; bigger files in parts
const SINGLE_UPLOAD_LIMIT = 100 * 1024 * 1024;   // 100 MB
const PART_SIZE = 100 * 1024 * 1024;             // 100 MB per part
const MAX_PARTS = 10000;                         // R2 / S3 limit

let client = null;

function isStorageConfigured() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

function getClient() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    });
  }
  return client;
}

const bucket = () => process.env.R2_BUCKET;

/**
 * Starts an upload. Small files get one signed PUT URL; large files get
 * a multipart upload with one signed URL per part.
 */
async function startUpload(key, size, contentType) {
  const s3 = getClient();

  if (size <= SINGLE_UPLOAD_LIMIT) {
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
      { expiresIn: 3600 }
    );
    return { mode: "single", url };
  }

  const partSize = Math.max(PART_SIZE, Math.ceil(size / MAX_PARTS));
  const partCount = Math.ceil(size / partSize);

  const { UploadId } = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType })
  );

  const urls = [];
  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    urls.push(
      await getSignedUrl(
        s3,
        new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId, PartNumber: partNumber }),
        { expiresIn: 6 * 3600 }
      )
    );
  }

  return { mode: "multipart", uploadId: UploadId, partSize, urls };
}

/**
 * Joins the uploaded parts into one file. parts = [{ PartNumber, ETag }]
 */
async function completeUpload(key, uploadId, parts) {
  await getClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts }
    })
  );
}

async function abortUpload(key, uploadId) {
  await getClient().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
}

async function deleteFile(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/**
 * A download link that works for 5 minutes and saves the file
 * under its original name.
 */
async function signDownload(key, fileName) {
  const safeName = String(fileName || "download").replace(/["\\\r\n]/g, "");
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safeName}"`
    }),
    { expiresIn: 300 }
  );
}

module.exports = {
  isStorageConfigured,
  startUpload,
  completeUpload,
  abortUpload,
  deleteFile,
  signDownload,
  SINGLE_UPLOAD_LIMIT
};
