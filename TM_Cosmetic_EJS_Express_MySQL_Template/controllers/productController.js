
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ==========================================
// PRODUCT IMAGE UPLOAD CONFIGURATION
// ==========================================

const uploadDirectory = path.join(
  __dirname,
  '../public/uploads/products'
);

// Create upload directory automatically.
if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${crypto.randomUUID()}${extension}`;

    cb(null, uniqueName);
  }
});

// Allow only JPG, JPEG, PNG and WEBP
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  const allowedExtensions = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp'
  ];

  const extension = path.extname(file.originalname).toLowerCase();

  if (
    allowedMimeTypes.includes(file.mimetype) &&
    allowedExtensions.includes(extension)
  ) {
    return cb(null, true);
  }

  cb(new Error('Only JPG, JPEG, PNG and WEBP images are allowed.'));
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// IMPORTANT: Form field name must be product_image.
exports.uploadProductImage = upload.single('product_image');

// ==========================================
// HELPER: GET IMAGE PATH
// ==========================================

const getProductImagePath = (file) => {
  if (!file) {
    return null;
  }

  return `/uploads/products/${file.filename}`;
};

// ==========================================
// HELPER: DELETE PRODUCT IMAGE
// ==========================================

const deleteProductImage = (imagePath) => {
  if (!imagePath) {
    return;
  }

  const filename = path.basename(imagePath);
  const fullPath = path.join(uploadDirectory, filename);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

// ==========================================
// HELPER: REMOVE NEWLY UPLOADED IMAGE
// ==========================================

const removeUploadedImage = (req) => {
  if (req.file) {
    deleteProductImage(getProductImagePath(req.file));
  }
};

// ==========================================
// HELPER: CONVERT EMPTY VALUES
// ==========================================

const getNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return Number(value);
};

const getTextOrNull = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return value.trim();
};

// ==========================================
// GET ALL PRODUCTS
// ==========================================

exports.productList = async (req, res) => {
  try {
    const [products] = await db.query(`
      SELECT *
      FROM tm_cosmetics_stocks
      ORDER BY id DESC
    `);

    return res.render('products/manage-list', {
      title: 'Manage Products | TM Cosmetic',
      products,
      updated: req.query.updated === '1',
      deleted: req.query.deleted === '1',
      created: req.query.created === '1'
    });

  } catch (error) {
    console.error('Product list error:', error);

    return res.status(500).send('Unable to load products.');
  }
};

// ==========================================
// SHOW ADD PRODUCT PAGE
// ==========================================

exports.showAddProduct = (req, res) => {
  return res.render('products/add', {
    title: 'Add Product | TM Cosmetic',
    error: null,
    product: {}
  });
};

// ==========================================
// ADD NEW PRODUCT
// ==========================================

exports.addProduct = async (req, res) => {
  try {
    // Temporary debugging information
    console.log('========== ADD PRODUCT DEBUG ==========');
    console.log('Product form data:', req.body);
    console.log('Uploaded image:', req.file);
    console.log('=======================================');

    const {
      product_name,
      brand_name,
      category,
      sub_category,
      size,
      mrp,
      discount,
      mfg_date,
      expiry_date,
      stock
    } = req.body;

    const product = req.body || {};

    const price = getNumberOrNull(mrp);
    const discountValue = getNumberOrNull(discount) ?? 0;
    const stockValue = getNumberOrNull(stock);

    let validationError = null;

    if (!product_name || !product_name.trim()) {
      validationError = 'Product name is required.';
    } else if (
      price !== null &&
      (!Number.isFinite(price) || price < 0)
    ) {
      validationError = 'Please enter a valid MRP.';
    } else if (
      !Number.isFinite(discountValue) ||
      discountValue < 0 ||
      discountValue > 100
    ) {
      validationError = 'Discount must be between 0 and 100.';
    } else if (
      stockValue !== null &&
      (!Number.isInteger(stockValue) || stockValue < 0)
    ) {
      validationError = 'Stock must be a non-negative whole number.';
    }

    if (validationError) {
      removeUploadedImage(req);

      return res.status(400).render('products/add', {
        title: 'Add Product | TM Cosmetic',
        error: validationError,
        product
      });
    }

    // Get uploaded image path
    const productImage = getProductImagePath(req.file);

    console.log('Image path being saved:', productImage);

    // Insert product and image path into database
    const [result] = await db.query(`
      INSERT INTO tm_cosmetics_stocks
      (
        product_name,
        product_image,
        brand_name,
        category,
        sub_category,
        size,
        mrp,
        discount,
        mfg_date,
        expiry_date,
        stock
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      product_name.trim(),
      productImage,
      getTextOrNull(brand_name),
      getTextOrNull(category),
      getTextOrNull(sub_category),
      getTextOrNull(size),
      price,
      discountValue,
      mfg_date || null,
      expiry_date || null,
      stockValue
    ]);

    console.log('Product inserted successfully. ID:', result.insertId);
    console.log('Saved image path:', productImage);

    return res.redirect('/manage-products?created=1');

  } catch (error) {
    console.error('Add product error:', error);

    removeUploadedImage(req);

    return res.status(500).send('Unable to add product.');
  }
};

// ==========================================
// SHOW EDIT PRODUCT PAGE
// ==========================================

exports.showEditProduct = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).send('Invalid product ID.');
    }

    const [rows] = await db.query(
      'SELECT * FROM tm_cosmetics_stocks WHERE id = ? LIMIT 1',
      [id]
    );

    if (!rows.length) {
      return res.status(404).send('Product not found.');
    }

    return res.render('products/edit', {
      title: 'Edit Product | TM Cosmetic',
      product: rows[0],
      error: null
    });

  } catch (error) {
    console.error('Edit product page error:', error);

    return res.status(500).send('Unable to load product.');
  }
};

// ==========================================
// UPDATE PRODUCT
// ==========================================

exports.updateProduct = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      removeUploadedImage(req);
      return res.status(400).send('Invalid product ID.');
    }

    const {
      product_name,
      brand_name,
      category,
      sub_category,
      size,
      mrp,
      discount,
      mfg_date,
      expiry_date,
      stock
    } = req.body;

    const price = getNumberOrNull(mrp);
    const discountValue = getNumberOrNull(discount) ?? 0;
    const stockValue = getNumberOrNull(stock);

    let validationError = null;

    if (!product_name || !product_name.trim()) {
      validationError = 'Product name is required.';
    } else if (
      price !== null &&
      (!Number.isFinite(price) || price < 0)
    ) {
      validationError = 'Please enter a valid MRP.';
    } else if (
      !Number.isFinite(discountValue) ||
      discountValue < 0 ||
      discountValue > 100
    ) {
      validationError = 'Discount must be between 0 and 100.';
    } else if (
      stockValue !== null &&
      (!Number.isInteger(stockValue) || stockValue < 0)
    ) {
      validationError = 'Stock must be a non-negative whole number.';
    }

    if (validationError) {
      removeUploadedImage(req);
      return res.status(400).send(validationError);
    }

    const [existingRows] = await db.query(
      'SELECT product_image FROM tm_cosmetics_stocks WHERE id = ? LIMIT 1',
      [id]
    );

    if (!existingRows.length) {
      removeUploadedImage(req);
      return res.status(404).send('Product not found.');
    }

    const oldImage = existingRows[0].product_image;

    // Use new image if uploaded; otherwise keep existing image.
    const newImage = req.file
      ? getProductImagePath(req.file)
      : oldImage;

    const [result] = await db.query(`
      UPDATE tm_cosmetics_stocks
      SET
        product_name = ?,
        product_image = ?,
        brand_name = ?,
        category = ?,
        sub_category = ?,
        size = ?,
        mrp = ?,
        discount = ?,
        mfg_date = ?,
        expiry_date = ?,
        stock = ?
      WHERE id = ?
    `, [
      product_name.trim(),
      newImage,
      getTextOrNull(brand_name),
      getTextOrNull(category),
      getTextOrNull(sub_category),
      getTextOrNull(size),
      price,
      discountValue,
      mfg_date || null,
      expiry_date || null,
      stockValue,
      id
    ]);

    if (!result.affectedRows) {
      removeUploadedImage(req);
      return res.status(404).send('Product not found.');
    }

    // Delete previous image only after successful update.
    if (req.file && oldImage && oldImage !== newImage) {
      deleteProductImage(oldImage);
    }

    return res.redirect('/manage-products?updated=1');

  } catch (error) {
    console.error('Update product error:', error);

    removeUploadedImage(req);

    return res.status(500).send('Unable to update product.');
  }
};

// ==========================================
// DELETE PRODUCT
// ==========================================

exports.deleteProduct = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).send('Invalid product ID.');
    }

    const [rows] = await db.query(
      'SELECT product_image FROM tm_cosmetics_stocks WHERE id = ? LIMIT 1',
      [id]
    );

    if (!rows.length) {
      return res.status(404).send('Product not found.');
    }

    const imagePath = rows[0].product_image;

    const [result] = await db.query(
      'DELETE FROM tm_cosmetics_stocks WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).send('Product not found.');
    }

    // Delete associated image after successful deletion.
    deleteProductImage(imagePath);

    return res.redirect('/manage-products?deleted=1');

  } catch (error) {
    console.error('Delete product error:', error);

    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).send(
        'This product is linked to other records and cannot be deleted.'
      );
    }

    return res.status(500).send('Unable to delete product.');
  }
};

// ==========================================
// UPDATE STOCK
// ==========================================

exports.updateStock = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stock = Number(req.body.stock);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).send('Invalid product ID.');
    }

    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).send('Please enter valid stock.');
    }

    const [result] = await db.query(
      'UPDATE tm_cosmetics_stocks SET stock = ? WHERE id = ?',
      [stock, id]
    );

    if (!result.affectedRows) {
      return res.status(404).send('Product not found.');
    }

    return res.redirect('/manage-products?updated=1');

  } catch (error) {
    console.error('Stock update error:', error);

    return res.status(500).send('Unable to update stock.');
  }
};
