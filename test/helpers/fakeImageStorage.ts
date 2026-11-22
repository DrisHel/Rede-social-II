import type { ImageStorage, UploadedFile } from '../../src/uploads/storage.js';

export class FakeImageStorage implements ImageStorage {
  public readonly uploads: UploadedFile[] = [];

  async upload(file: UploadedFile): Promise<string> {
    this.uploads.push(file);
    return `https://fake-bucket.test/${file.originalname}`;
  }
}
