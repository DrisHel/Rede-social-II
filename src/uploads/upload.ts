import multer from 'multer';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_POST_IMAGES = 5;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(new Error('Formato de imagem não suportado (use JPEG, PNG ou WebP)'));
      return;
    }
    callback(null, true);
  },
});
