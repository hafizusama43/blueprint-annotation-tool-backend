import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const uploadsDirectory = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(uploadsDirectory)) {
    fs.mkdirSync(uploadsDirectory, { recursive: true });
}

const allowedMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const allowedExtensions = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const maxFileSizeBytes = 350 * 1024 * 1024; // 350 MB

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, uploadsDirectory);
    },
    filename: (_req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase() || '.bin';
        const safeBaseName = path
            .basename(file.originalname, extension)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);

        const finalBase = safeBaseName || 'blueprint';
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        callback(null, `${finalBase}-${uniqueSuffix}${extension}`);
    },
});

export const blueprintUpload = multer({
    storage,
    limits: {
        fileSize: maxFileSizeBytes,
    },
    fileFilter: (_req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const isAllowedMimeType = allowedMimeTypes.has(file.mimetype);
        const isAllowedExtension = allowedExtensions.has(extension);

        if (isAllowedMimeType && isAllowedExtension) {
            callback(null, true);
            return;
        }

        callback(new Error('Only PDF, PNG, JPG, and JPEG files are allowed.'));
    },
});
