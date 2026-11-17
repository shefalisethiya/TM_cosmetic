const db = require('../config/db');
const demoProducts = require('../data/demoProducts');

async function getProducts() {
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.name, p.description, p.price, p.mrp, p.image_url,
              c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = 1 ORDER BY p.id DESC`
    );
    return rows.length ? rows : demoProducts;
  } catch (error) {
    console.warn('MySQL unavailable; showing demo products:', error.code || error.message);
    return demoProducts;
  }
}

exports.home = async (req, res) => {
  const items = await getProducts();
  res.render('home', { title: 'TM Cosmetic | Beauty, Naturally', products: items.slice(0, 8) });
};

exports.products = async (req, res) => {
  const items = await getProducts();
  const category = req.query.category || '';
  const filtered = category
    ? items.filter(p => (p.category_name || p.category || '').toLowerCase() === category.toLowerCase())
    : items;
  res.render('products', { title: 'Shop Beauty | TM Cosmetic', products: filtered, selectedCategory: category });
};

exports.productDetails = async (req, res) => {
  const items = await getProducts();
  const product = items.find(p => String(p.id) === String(req.params.id));
  if (!product) return res.status(404).render('404', { title: 'Product not found' });
  res.render('product-details', { title: `${product.name} | TM Cosmetic`, product });
};