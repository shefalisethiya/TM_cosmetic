
const db = require('../config/db');

// Show cart
exports.viewCart = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [items] = await db.query(
      `SELECT
         ci.id AS cart_id,
         ci.quantity,
         p.id AS product_id,
         p.name,
         p.price,
         p.mrp,
         p.image_url,
         p.stock,
         (p.price * ci.quantity) AS line_total
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = ? AND p.is_active = 1`,
      [userId]
    );

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.line_total), 0
    );

    res.render('cart', {
      title: 'Shopping Cart | TM Cosmetic',
      items,
      subtotal
    });
  } catch (error) {
    console.error('View cart error:', error);
    res.status(500).send('Unable to load cart.');
  }
};

// Add product to cart
exports.addToCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const productId = Number(req.body.productId);
    const quantity = Math.max(1, Number(req.body.quantity) || 1);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).send('Invalid product.');
    }

    const [products] = await db.query(
      'SELECT id, stock, is_active FROM products WHERE id = ?',
      [productId]
    );

    if (!products.length || !products[0].is_active) {
      return res.status(404).send('Product not found.');
    }

    if (quantity > products[0].stock) {
      return res.status(400).send('Requested quantity is unavailable.');
    }

    await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [userId, productId, quantity]
    );

    res.redirect('/cart');
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).send('Unable to add product to cart.');
  }
};

// Update quantity
exports.updateCart = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const cartId = Number(req.params.id);
    const quantity = Number(req.body.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return res.status(400).send('Invalid quantity.');
    }

    const [result] = await db.query(
      `UPDATE cart_items ci
       JOIN products p ON p.id = ci.product_id
       SET ci.quantity = ?
       WHERE ci.id = ? AND ci.user_id = ? AND quantity <= p.stock`,
      [quantity, cartId, userId]
    );

    if (!result.affectedRows) {
      return res.status(400).send('Item not found or insufficient stock.');
    }

    res.redirect('/cart');
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).send('Unable to update cart.');
  }
};

// Remove product
exports.removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user.id;

    await db.query(
      'DELETE FROM cart_items WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );

    res.redirect('/cart');
  } catch (error) {
    console.error('Remove cart item error:', error);
    res.status(500).send('Unable to remove item.');
  }
};
