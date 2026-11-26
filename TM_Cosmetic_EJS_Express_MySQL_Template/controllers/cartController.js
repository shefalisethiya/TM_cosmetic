
const db = require('../config/db');

const PLACEHOLDER_IMG = '/images/placeholder.jpg';

// Fields used to display cart products
const ITEM_FIELDS = `
  ci.product_id AS product_id,

  CONCAT_WS(
    ' ',
    s.product_name,
    NULLIF(s.brand_name, s.product_name),
    s.size
  ) AS name,

  COALESCE(
    ROUND(s.mrp * (1 - COALESCE(s.discount, 0) / 100), 2),
    0
  ) AS price,

  s.mrp,

  COALESCE(
    NULLIF(TRIM(s.product_image), ''),
    '${PLACEHOLDER_IMG}'
  ) AS image_url,

  COALESCE(s.stock, 0) AS stock
`;

// Show cart
exports.viewCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userId = req.session.user.id;

    const [items] = await db.query(
      `SELECT
         ci.id AS cart_id,
         ci.quantity,
         ${ITEM_FIELDS},
         COALESCE(
           ROUND(s.mrp * (1 - COALESCE(s.discount, 0) / 100), 2)
           * ci.quantity,
           0
         ) AS line_total
       FROM cart_items ci
       LEFT JOIN tm_cosmetics_stocks s
         ON s.id = ci.product_id
       WHERE ci.user_id = ?`,
      [userId]
    );

    // Treat NULL or zero stock as unavailable
    items.forEach(item => {
      item.stock = Number(item.stock || 0);
      item.quantity = Number(item.quantity || 0);
      item.in_stock =
        item.stock > 0 && item.quantity > 0 && item.quantity <= item.stock;
    });

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.line_total || 0),
      0
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

    const productId = Number(
      req.body.productId || req.body.product_id
    );

    const quantity = Number(req.body.quantity || 1);

    if (
      !Number.isInteger(productId) ||
      productId <= 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    ) {
      return res.status(400).send('Invalid product or quantity.');
    }

    const [products] = await db.query(
      `SELECT id, mrp, COALESCE(stock, 0) AS stock
       FROM tm_cosmetics_stocks
       WHERE id = ?`,
      [productId]
    );

    if (!products.length || products[0].mrp === null) {
      return res.status(404).send('Product not found.');
    }

    const stock = Number(products[0].stock || 0);

    if (stock <= 0) {
      return res.status(400).send(
        'Sorry, this product is currently out of stock.'
      );
    }

    const [existing] = await db.query(
      `SELECT quantity
       FROM cart_items
       WHERE user_id = ? AND product_id = ?`,
      [userId, productId]
    );

    const inCart = existing.length
      ? Number(existing[0].quantity)
      : 0;

    if (inCart + quantity > stock) {
      return res.status(400).send(
        `Only ${stock} units are available. You already have ${inCart} in your cart.`
      );
    }

    await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
       quantity = quantity + VALUES(quantity)`,
      [userId, productId, quantity]
    );

    return res.redirect('/cart');

  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).send('Unable to add product to cart.');
  }
};


// Update cart quantity
exports.updateCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const cartId = Number(req.params.id);
    const quantity = Number(req.body.quantity);

    if (
      !Number.isInteger(cartId) ||
      cartId <= 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    ) {
      return res.status(400).send('Invalid cart item or quantity.');
    }

    // Get this user's cart item and its latest stock
    const [items] = await db.query(
      `SELECT
         ci.id,
         ci.product_id,
         COALESCE(s.stock, 0) AS stock
       FROM cart_items ci
       LEFT JOIN tm_cosmetics_stocks s
         ON s.id = ci.product_id
       WHERE ci.id = ? AND ci.user_id = ?`,
      [cartId, userId]
    );

    if (!items.length) {
      return res.status(404).send('Cart item not found.');
    }

    const stock = Number(items[0].stock || 0);

    if (stock <= 0) {
      return res.status(400).send(
        'This product is currently out of stock.'
      );
    }

    if (quantity > stock) {
      return res.status(400).send(
        `Only ${stock} units are available. Please enter a quantity up to ${stock}.`
      );
    }

    await db.query(
      `UPDATE cart_items
       SET quantity = ?
       WHERE id = ? AND user_id = ?`,
      [quantity, cartId, userId]
    );

    return res.redirect('/cart');

  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).send('Unable to update cart.');
  }
};


// Remove product from cart
exports.removeFromCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const cartId = Number(req.params.id);

    await db.query(
      `DELETE FROM cart_items
       WHERE id = ? AND user_id = ?`,
      [cartId, userId]
    );

    return res.redirect('/cart');

  } catch (error) {
    console.error('Remove cart item error:', error);
    res.status(500).send('Unable to remove item.');
  }
};
