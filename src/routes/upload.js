const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const UploadController = require('../controllers/UploadController');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only CSV and Excel files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
});

router.get('/upload', requireAuth, UploadController.showUpload);
router.post('/upload', requireAuth, upload.single('file'), UploadController.processUpload);
router.get('/upload/batch/:batchId', requireAuth, UploadController.viewBatch);
router.post('/upload/batch/:batchId/delete', requireAuth, UploadController.deleteBatch);

module.exports = router;
