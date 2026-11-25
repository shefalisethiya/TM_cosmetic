
const db = require('../config/db');

const PLACEHOLDER_IMG = '/images/placeholder.jpg';

const PRODUCT_SELECT = `
  SELECT
    s.id,
    CONCAT_WS(
      ' ',
      s.product_name,
      NULLIF(s.brand_name, s.product_name),
      s.size
    ) AS name,
    CONCAT_WS(' · ', s.category, s.sub_category) AS description,
    ROUND(
      s.mrp * (1 - COALESCE(s.discount, 0) / 100),
      2
    ) AS price,
    s.mrp,
    COALESCE(s.discount, 0) AS discount,
    s.size,
    s.category AS category_name,

    COALESCE(
      NULLIF(s.product_image, ''),
      '${PLACEHOLDER_IMG}'
    ) AS image_url,

    COALESCE(s.stock, 0) AS stock

  FROM tm_cosmetics_stocks s
`;

// ===================================
// STOCK STATUS
// ===================================
function withStockFlag(rows) {
  return rows.map(product => {
    const stock = Number(product.stock);

    return {
      ...product,
      stock,
      in_stock:
        product.stock !== null &&
        product.stock !== undefined &&
        stock > 0
    };
  });
}

// ===================================
// GET PRODUCTS FROM DATABASE
// ===================================
async function getProducts(filter = '') {
  let sql = PRODUCT_SELECT + `
    WHERE s.mrp IS NOT NULL
  `;

  const params = [];

  if (filter) {
    sql += `
      AND (
        s.category LIKE ?
        OR s.sub_category LIKE ?
        OR s.brand_name LIKE ?
        OR s.product_name LIKE ?
      )
    `;

    const search = `%${filter}%`;

    params.push(search, search, search, search);
  }

  sql += `
    ORDER BY
      (COALESCE(s.stock, 0) >= 1) DESC,
      s.id DESC
  `;

  const [rows] = await db.query(sql, params);

  return withStockFlag(rows);
}

// ===================================
// HOME PAGE
// ===================================
exports.home = async (req, res) => {
  try {
    const products = await getProducts();

    return res.render('home', {
      title: 'TM Cosmetic | Beauty, Naturally',
      products: products.slice(0, 8)
    });

  } catch (error) {
    console.error('Home page error:', error);
    return res.status(500).send('Unable to load products.');
  }
};

// ===================================
// ALL PRODUCTS PAGE
// ===================================
exports.products = async (req, res) => {
  try {
    const category = (req.query.category || '').trim();

    const products = await getProducts(category);

    console.log('========== PRODUCT STOCK AND IMAGE CHECK ==========');

    console.table(
      products.map(p => ({
        id: p.id,
        name: p.name,
        image_url: p.image_url,
        stock: p.stock,
        in_stock: p.in_stock
      }))
    );

    console.log('===================================================');

    return res.render('products', {
      title: 'Shop Beauty | TM Cosmetic',
      products,
      selectedCategory: category
    });

  } catch (error) {
    console.error('Products page error:', error);
    return res.status(500).send('Unable to load products.');
  }
};

// ===================================
// PRODUCT DETAILS PAGE
// ===================================
exports.productDetails = async (req, res) => {
  try {
    const sql = PRODUCT_SELECT + `
      WHERE s.id = ?
      AND s.mrp IS NOT NULL
      LIMIT 1
    `;

    const [rows] = await db.query(sql, [req.params.id]);

    if (!rows.length) {
      return res.status(404).render('404', {
        title: 'Product not found'
      });
    }

    const product = withStockFlag(rows)[0];

    console.log('PRODUCT DETAILS:', {
      id: product.id,
      name: product.name,
      image_url: product.image_url,
      stock: product.stock,
      in_stock: product.in_stock
    });

    return res.render('product-details', {
      title: `${product.name} | TM Cosmetic`,
      product
    });

  } catch (error) {
    console.error('Product details error:', error);
    return res.status(500).send('Unable to load product.');
  }
};

// ===================================
// EXPORT
// ===================================
module.exports.PRODUCT_SELECT = PRODUCT_SELECT;
