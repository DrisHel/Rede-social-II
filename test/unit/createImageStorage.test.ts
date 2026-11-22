import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImageStorage } from '../../src/uploads/createImageStorage.js';
import { LocalImageStorage } from '../../src/uploads/localStorage.js';
import { S3ImageStorage } from '../../src/uploads/s3Storage.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createImageStorage', () => {
  it('uses local storage when AWS configuration is missing or incomplete', () => {
    vi.stubEnv('AWS_S3_BUCKET', '');
    vi.stubEnv('AWS_REGION', '');
    expect(createImageStorage()).toBeInstanceOf(LocalImageStorage);

    vi.stubEnv('AWS_S3_BUCKET', 'test-bucket');
    expect(createImageStorage()).toBeInstanceOf(LocalImageStorage);

    vi.stubEnv('AWS_S3_BUCKET', '');
    vi.stubEnv('AWS_REGION', 'us-east-1');
    expect(createImageStorage()).toBeInstanceOf(LocalImageStorage);
  });

  it('uses S3 storage only when bucket and region are both configured', () => {
    vi.stubEnv('AWS_S3_BUCKET', 'test-bucket');
    vi.stubEnv('AWS_REGION', 'us-east-1');

    expect(createImageStorage()).toBeInstanceOf(S3ImageStorage);
  });
});
