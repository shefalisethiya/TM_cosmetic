
const db = require('../config/db');

// Get active products from MySQL
async function getProducts() {
  const [rows] = await db.query(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.price,
      p.mrp,
      p.image_url,
      p.stock,
      p.is_active,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = 1
    ORDER BY p.id DESC
  `);

  return rows;
}

// HOME PAGE
exports.home = async (req, res) => {
  try {
    const items = await getProducts();

    res.render('home', {
      title: 'TM Cosmetic | Beauty, Naturally',
      products: items.slice(0, 8)
    });
  } catch (error) {
    console.error('Home page error:', error);
    res.status(500).send('Unable to load products.');
  }
};

// ALL PRODUCTS
exports.products = async (req, res) => {
  try {
    const items = await getProducts();
    const category = req.query.category || '';

    const filtered = category
      ? items.filter(p =>
          (p.category_name || '').toLowerCase() === category.toLowerCase()
        )
      : items;

    res.render('products', {
      title: 'Shop Beauty | TM Cosmetic',
      products: filtered,
      selectedCategory: category
    });
  } catch (error) {
    console.error('Products page error:', error);
    res.status(500).send('Unable to load products.');
  }
};

// PRODUCT DETAILS
exports.productDetails = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.price,
         p.mrp,
         p.image_url,
         p.stock,
         c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ? AND p.is_active = 1
       LIMIT 1`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).render('404', {
        title: 'Product not found'
      });
    }

    res.render('product-details', {
      title: `${rows[0].name} | TM Cosmetic`,
      product: rows[0]
    });
  } catch (error) {
    console.error('Product details error:', error);
    res.status(500).send('Unable to load product.');
  }
};
