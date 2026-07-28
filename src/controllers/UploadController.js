const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { UploadBatch, ContactUpload } = require('../models/database');

class UploadController {
    async showUpload(req, res) {
        try {
            const batches = await UploadBatch.find({ vendor_id: req.vendorId })
                .sort({ createdAt: -1 })
                .limit(20);

            res.render('upload', {
                currentPage: 'upload',
                batches,
                success: req.query.success,
                error: req.query.error
            });
        } catch (error) {
            console.error('[UPLOAD] Error loading upload page:', error);
            res.render('upload', {
                currentPage: 'upload',
                batches: [],
                success: null,
                error: 'Failed to load upload page'
            });
        }
    }

    async processUpload(req, res) {
        try {
            if (!req.file) {
                return res.redirect('/upload?error=No file uploaded');
            }

            const file = req.file;
            const ext = path.extname(file.originalname).toLowerCase();
            const fileType = ext === '.csv' ? 'csv' : (ext === '.xls' ? 'xls' : 'xlsx');

            const workbook = XLSX.readFile(file.path);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet);

            if (rows.length === 0) {
                fs.unlinkSync(file.path);
                return res.redirect('/upload?error=File is empty or has no data rows');
            }

            const columns = Object.keys(rows[0]);

            const batch = new UploadBatch({
                vendor_id: req.vendorId,
                filename: file.filename,
                original_name: file.originalname,
                file_type: fileType,
                columns,
                total_rows: rows.length,
                status: 'processing'
            });
            await batch.save();

            let successCount = 0;
            let errorCount = 0;
            const errors = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNum = i + 2;
                const validationErrors = [];

                const hasData = Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '');
                if (!hasData) {
                    validationErrors.push('Row is empty');
                }

                const contact = new ContactUpload({
                    vendor_id: req.vendorId,
                    batch_id: batch._id,
                    row_number: rowNum,
                    fields: row,
                    status: validationErrors.length > 0 ? 'invalid' : 'valid',
                    validation_errors: validationErrors
                });

                try {
                    await contact.save();
                    if (validationErrors.length > 0) {
                        errorCount++;
                        errors.push({ row: rowNum, message: validationErrors.join('; ') });
                    } else {
                        successCount++;
                    }
                } catch (saveError) {
                    errorCount++;
                    errors.push({ row: rowNum, message: saveError.message });
                }
            }

            batch.success_rows = successCount;
            batch.error_rows = errorCount;
            batch.errors = errors.slice(0, 50);
            batch.status = errorCount === rows.length ? 'failed' : 'completed';
            await batch.save();

            fs.unlinkSync(file.path);

            const msg = `Uploaded ${successCount} contacts successfully` + (errorCount > 0 ? `. ${errorCount} rows had errors.` : '');
            res.redirect(`/upload?success=${encodeURIComponent(msg)}`);
        } catch (error) {
            console.error('[UPLOAD] Error processing upload:', error);
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.redirect(`/upload?error=${encodeURIComponent(error.message || 'Failed to process upload')}`);
        }
    }

    async viewBatch(req, res) {
        try {
            const batch = await UploadBatch.findOne({
                _id: req.params.batchId,
                vendor_id: req.vendorId
            });

            if (!batch) {
                return res.redirect('/upload?error=Upload batch not found');
            }

            const page = parseInt(req.query.page) || 1;
            const limit = 50;
            const skip = (page - 1) * limit;

            const total = await ContactUpload.countDocuments({ batch_id: batch._id });
            const contacts = await ContactUpload.find({ batch_id: batch._id })
                .sort({ row_number: 1 })
                .skip(skip)
                .limit(limit);

            const totalPages = Math.ceil(total / limit);

            res.render('upload-detail', {
                currentPage: 'upload',
                batch,
                contacts,
                pagination: {
                    page,
                    totalPages,
                    total,
                    limit
                }
            });
        } catch (error) {
            console.error('[UPLOAD] Error viewing batch:', error);
            res.redirect('/upload?error=Failed to load batch details');
        }
    }

    async deleteBatch(req, res) {
        try {
            const batch = await UploadBatch.findOneAndDelete({
                _id: req.params.batchId,
                vendor_id: req.vendorId
            });

            if (!batch) {
                return res.redirect('/upload?error=Upload batch not found');
            }

            await ContactUpload.deleteMany({ batch_id: batch._id });

            res.redirect('/upload?success=Upload batch deleted successfully');
        } catch (error) {
            console.error('[UPLOAD] Error deleting batch:', error);
            res.redirect('/upload?error=Failed to delete batch');
        }
    }
}

module.exports = new UploadController();
