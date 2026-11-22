import { beforeEach, describe, expect, it, vi } from 'vitest';

const s3Mock = vi.hoisted(() => ({
  commands: [] as unknown[],
  send: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: class {
    constructor(input: unknown) {
      s3Mock.commands.push(input);
    }
  },
  S3Client: class {
    send(command: unknown) {
      return s3Mock.send(command);
    }
  },
}));

import { S3ImageStorage } from '../../src/uploads/s3Storage.js';

describe('S3ImageStorage', () => {
  beforeEach(() => {
    s3Mock.commands.length = 0;
    s3Mock.send.mockReset().mockResolvedValue({});
  });

  it('sends the file to the configured bucket and returns its URL', async () => {
    const file = {
      buffer: Buffer.from('image bytes'),
      mimetype: 'image/webp',
      originalname: 'photo.webp',
    };
    const storage = new S3ImageStorage('test-bucket', 'us-east-1');

    const url = await storage.upload(file);

    expect(s3Mock.commands).toHaveLength(1);
    expect(s3Mock.commands[0]).toEqual({
      Bucket: 'test-bucket',
      Key: expect.stringMatching(/^posts\/[0-9a-f-]+\.webp$/),
      Body: file.buffer,
      ContentType: 'image/webp',
    });
    expect(s3Mock.send).toHaveBeenCalledTimes(1);
    expect(url).toBe(`https://test-bucket.s3.us-east-1.amazonaws.com/${(s3Mock.commands[0] as { Key: string }).Key}`);
  });

  it('propagates storage errors to the caller', async () => {
    const storageError = new Error('S3 indisponível');
    s3Mock.send.mockRejectedValueOnce(storageError);
    const storage = new S3ImageStorage('test-bucket', 'us-east-1');

    await expect(storage.upload({
      buffer: Buffer.from('image bytes'),
      mimetype: 'image/png',
      originalname: 'photo.png',
    })).rejects.toBe(storageError);
  });
});
