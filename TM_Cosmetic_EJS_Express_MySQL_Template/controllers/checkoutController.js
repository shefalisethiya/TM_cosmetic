const db = require('../config/db');

// Same field mapping as the products and cart controllers
const PLACEHOLDER_IMG = '/images/placeholder.jpg';

const ITEM_FIELDS = `
  s.id AS product_id,
  CONCAT_WS(' ', s.product_name, NULLIF(s.brand_name, s.product_name), s.size) AS name,
  ROUND(s.mrp * (1 - COALESCE(s.discount, 0) / 100), 2) AS price,
  '${PLACEHOLDER_IMG}' AS image_url,
  COALESCE(s.stock, 0) AS stock
`;

// Error type for problems the customer should see (stock, etc.)
class OrderError extends Error {}

// ==========================================
// SHOW CHECKOUT PAGE
// ==========================================
exports.showCheckout = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    const userId = Number(req.session.user.id);

    const [items] = await db.query(
      `SELECT
         ci.quantity,
         ${ITEM_FIELDS},
         ROUND(s.mrp * (1 - COALESCE(s.discount, 0) / 100), 2) * ci.quantity AS line_total
       FROM cart_items ci
       INNER JOIN tm_cosmetics_stocks s ON s.id = ci.product_id
       WHERE ci.user_id = ? AND s.mrp IS NOT NULL`,
      [userId]
    );

    if (!items.length) {
      return res.redirect('/cart');
    }

    // If anything in the cart is out of stock or over stock, send the customer back to fix it
    const hasStockProblem = items.some(
      item => Number(item.stock) < 1 || Number(item.quantity) > Number(item.stock)
    );
    if (hasStockProblem) {
      return res.redirect('/cart');
    }

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.line_total),
      0
    );

    const [users] = await db.query(
      'SELECT name, phone FROM users WHERE id = ?',
      [userId]
    );

    res.render('checkout', {
      title: 'Checkout | TM Cosmetic',
      items,
      subtotal,
      customer: users[0] || {}
    });

  } catch (error) {
    console.error('Checkout page error:', error);
    res.status(500).send('Unable to load checkout page.');
  }
};


// ==========================================
// PLACE ORDER
// ==========================================
exports.placeOrder = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    const userId = Number(req.session.user.id);

    const {
      customer_name,
      mobile,
      address,
      city,
      pincode,
      payment_method
    } = req.body;

    // Validate payment method
    const allowedMethods = ['COD', 'CARD', 'UPI'];

    if (!allowedMethods.includes(payment_method)) {
      return res.status(400).send(
        'Please select a valid payment method.'
      );
    }

    // Validate delivery information
    if (
      !customer_name?.trim() ||
      !/^[0-9]{10}$/.test(mobile || '') ||
      !address?.trim() ||
      !city?.trim() ||
      !/^[0-9]{6}$/.test(pincode || '')
    ) {
      return res.status(400).send(
        'Please enter valid delivery details.'
      );
    }

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // Fetch cart items and lock the stock rows so two orders can't take the same stock
    const [items] = await connection.query(
      `SELECT
         ci.id AS cart_id,
         ci.quantity,
         ${ITEM_FIELDS}
       FROM cart_items ci
       INNER JOIN tm_cosmetics_stocks s ON s.id = ci.product_id
       WHERE ci.user_id = ? AND s.mrp IS NOT NULL
       FOR UPDATE`,
      [userId]
    );

    if (!items.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).send('Your cart is empty.');
    }

    // Calculate subtotal and validate stock (stock < 1 = out of stock)
    let subtotal = 0;

    for (const item of items) {
      if (Number(item.stock) < 1) {
        throw new OrderError(`${item.name} is out of stock.`);
      }
      if (Number(item.quantity) > Number(item.stock)) {
        throw new OrderError(
          `Only ${item.stock} left for ${item.name}. Please update your cart.`
        );
      }

      subtotal += Number(item.price) * Number(item.quantity);
    }

    subtotal = Math.round(subtotal * 100) / 100;

    const deliveryCharge = 0;
    const totalAmount = subtotal + deliveryCharge;

    const paymentStatus = 'Pending';

    const orderStatus = payment_method === 'COD'
      ? 'Placed'
      : 'Pending Payment';

    // Insert order
    const [orderResult] = await connection.query(
      `INSERT INTO orders
       (
         user_id,
         customer_name,
         mobile,
         address,
         city,
         pincode,
         subtotal,
         delivery_charge,
         total_amount,
         payment_method,
         payment_status,
         order_status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        customer_name.trim(),
        mobile,
        address.trim(),
        city.trim(),
        pincode,
        subtotal,
        deliveryCharge,
        totalAmount,
        payment_method,
        paymentStatus,
        orderStatus
      ]
    );

    const orderId = orderResult.insertId;

    // Insert order items
    for (const item of items) {
      const price = Number(item.price);
      const quantity = Number(item.quantity);
      const lineTotal = Math.round(price * quantity * 100) / 100;

      await connection.query(
        `INSERT INTO order_items
         (
           order_id,
           product_id,
           product_name,
           product_image,
           price,
           quantity,
           line_total
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.name,
          item.image_url,
          price,
          quantity,
          lineTotal
        ]
      );
    }

    // COD: reduce stock and clear cart
    if (payment_method === 'COD') {
      for (const item of items) {
        const [stockResult] = await connection.query(
          `UPDATE tm_cosmetics_stocks
           SET stock = stock - ?
           WHERE id = ? AND COALESCE(stock, 0) >= ?`,
          [
            item.quantity,
            item.product_id,
            item.quantity
          ]
        );

        if (stockResult.affectedRows !== 1) {
          throw new OrderError(
            `Stock update failed for ${item.name}. Please try again.`
          );
        }
      }

      await connection.query(
        'DELETE FROM cart_items WHERE user_id = ?',
        [userId]
      );
    }

    await connection.commit();
    transactionStarted = false;

    return res.redirect(`/order-success/${orderId}`);

  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error('Place order error:', error);

    // Stock problems: show the real message to the customer
    if (error instanceof OrderError) {
      return res.status(400).send(error.message);
    }

    return res.status(500).send(
      'Unable to place your order. Please try again.'
    );

  } finally {
    if (connection) {
      connection.release();
    }
  }
};


// ==========================================
// ORDER SUCCESS PAGE
// ==========================================
exports.orderSuccess = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    const userId = Number(req.session.user.id);
    const orderId = Number(req.params.id);

    const [orders] = await db.query(
      `SELECT *
       FROM orders
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [orderId, userId]
    );

    if (!orders.length) {
      return res.status(404).send('Order not found.');
    }

    const [items] = await db.query(
      `SELECT *
       FROM order_items
       WHERE order_id = ?`,
      [orderId]
    );

    res.render('order-success', {
      title: 'Order Confirmed | TM Cosmetic',
      order: orders[0],
      items
    });

  } catch (error) {
    console.error('Order confirmation error:', error);

    res.status(500).send(
      'Unable to load order confirmation.'
    );
  }
};