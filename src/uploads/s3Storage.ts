import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ImageStorage, UploadedFile } from './storage.js';

export class S3ImageStorage implements ImageStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    private readonly region: string,
  ) {
    this.client = new S3Client({ region });
  }

  async upload(file: UploadedFile): Promise<string> {
    const extension = file.originalname.split('.').pop();
    const key = `posts/${randomUUID()}${extension ? `.${extension}` : ''}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
