export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface ImageStorage {
  upload(file: UploadedFile): Promise<string>;
}
