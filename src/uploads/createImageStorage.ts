import type { ImageStorage } from './storage.js';
import { S3ImageStorage } from './s3Storage.js';
import { LocalImageStorage } from './localStorage.js';

export function createImageStorage(): ImageStorage {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;

  if (bucket && region) {
    return new S3ImageStorage(bucket, region);
  }

  return new LocalImageStorage();
}
