
const db = require('../config/db');

const PLACEHOLDER_IMG = '/images/placeholder.jpg';

// ==========================================
// COMMON PRODUCT FIELD MAPPING
// ==========================================
const ITEM_FIELDS = `
  s.id AS product_id,

  CONCAT_WS(
    ' ',
    s.product_name,
    NULLIF(s.brand_name, s.product_name),
    s.size
  ) AS name,

  ROUND(
    s.mrp * (1 - COALESCE(s.discount, 0) / 100),
    2
  ) AS price,

  COALESCE(
    NULLIF(TRIM(s.product_image), ''),
    '${PLACEHOLDER_IMG}'
  ) AS image_url,

  COALESCE(s.stock, 0) AS stock
`;

// ==========================================
// CUSTOM ORDER ERROR
// ==========================================
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

    // Fetch cart products from inventory table
    const [items] = await db.query(
      `SELECT
         ci.quantity,
         ${ITEM_FIELDS},
         ROUND(
           s.mrp * (1 - COALESCE(s.discount, 0) / 100),
           2
         ) * ci.quantity AS line_total

       FROM cart_items ci

       INNER JOIN tm_cosmetics_stocks s
         ON s.id = ci.product_id

       WHERE ci.user_id = ?
         AND s.mrp IS NOT NULL`,
      [userId]
    );

    // Empty cart
    if (!items.length) {
      return res.redirect('/cart');
    }

    // Validate stock
    const hasStockProblem = items.some(
      item =>
        Number(item.stock) < 1 ||
        Number(item.quantity) > Number(item.stock)
    );

    if (hasStockProblem) {
      return res.redirect('/cart');
    }

    // Calculate subtotal
    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.line_total),
      0
    );

    // Fetch customer information
    const [users] = await db.query(
      `SELECT name, phone
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    // Render checkout page
    return res.render('checkout', {
      title: 'Checkout | TM Cosmetic',
      items,
      subtotal,
      customer: users[0] || {}
    });

  } catch (error) {
    console.error('Checkout page error:', error);

    return res.status(500).send(
      'Unable to load checkout page.'
    );
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

    // ======================================
    // VALIDATE PAYMENT METHOD
    // ======================================
    const allowedMethods = ['COD', 'CARD', 'UPI'];

    if (!allowedMethods.includes(payment_method)) {
      return res.status(400).send(
        'Please select a valid payment method.'
      );
    }

    // ======================================
    // VALIDATE DELIVERY DETAILS
    // ======================================
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

    // ======================================
    // START DATABASE TRANSACTION
    // ======================================
    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // ======================================
    // FETCH CART ITEMS AND LOCK STOCK ROWS
    // ======================================
    const [items] = await connection.query(
      `SELECT
         ci.id AS cart_id,
         ci.quantity,
         ${ITEM_FIELDS}

       FROM cart_items ci

       INNER JOIN tm_cosmetics_stocks s
         ON s.id = ci.product_id

       WHERE ci.user_id = ?
         AND s.mrp IS NOT NULL

       FOR UPDATE`,
      [userId]
    );

    if (!items.length) {
      throw new OrderError('Your cart is empty.');
    }

    // ======================================
    // VALIDATE STOCK AND CALCULATE SUBTOTAL
    // ======================================
    let subtotal = 0;

    for (const item of items) {

      if (Number(item.stock) < 1) {
        throw new OrderError(
          `${item.name} is out of stock.`
        );
      }

      if (
        Number(item.quantity) < 1 ||
        Number(item.quantity) > Number(item.stock)
      ) {
        throw new OrderError(
          `Only ${item.stock} left for ${item.name}. Please update your cart.`
        );
      }

      subtotal +=
        Number(item.price) * Number(item.quantity);
    }

    subtotal = Math.round(subtotal * 100) / 100;

    const deliveryCharge = 0;
    const totalAmount = subtotal + deliveryCharge;

    const paymentStatus = 'Pending';

    const orderStatus =
      payment_method === 'COD'
        ? 'Placed'
        : 'Pending Payment';

    // ======================================
    // INSERT MAIN ORDER
    // ======================================
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

    // ======================================
    // INSERT ORDER ITEMS
    // ======================================
    for (const item of items) {

      const price = Number(item.price);
      const quantity = Number(item.quantity);

      const lineTotal = Math.round(
        price * quantity * 100
      ) / 100;

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

    // ======================================
    // COD: REDUCE STOCK
    // ======================================
    if (payment_method === 'COD') {

      for (const item of items) {

        const [stockResult] = await connection.query(
          `UPDATE tm_cosmetics_stocks

           SET stock = stock - ?

           WHERE id = ?
             AND COALESCE(stock, 0) >= ?`,
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

      // Clear customer's cart after successful COD order
      await connection.query(
        `DELETE FROM cart_items
         WHERE user_id = ?`,
        [userId]
      );
    }

    // ======================================
    // COMMIT TRANSACTION
    // ======================================
    await connection.commit();
    transactionStarted = false;

    return res.redirect(
      `/order-success/${orderId}`
    );

  } catch (error) {

    // Rollback if transaction started
    if (connection && transactionStarted) {
      await connection.rollback();
      transactionStarted = false;
    }

    console.error('Place order error:', error);

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

    // Fetch order belonging to logged-in customer
    const [orders] = await db.query(
      `SELECT *
       FROM orders
       WHERE id = ?
         AND user_id = ?
       LIMIT 1`,
      [orderId, userId]
    );

    if (!orders.length) {
      return res.status(404).send(
        'Order not found.'
      );
    }

    // Fetch ordered products
    const [items] = await db.query(
      `SELECT *
       FROM order_items
       WHERE order_id = ?`,
      [orderId]
    );

    return res.render('order-success', {
      title: 'Order Confirmed | TM Cosmetic',
      order: orders[0],
      items
    });

  } catch (error) {
    console.error('Order confirmation error:', error);

    return res.status(500).send(
      'Unable to load order confirmation.'
    );
  }
};
