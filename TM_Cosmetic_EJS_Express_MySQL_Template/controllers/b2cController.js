
const db = require('../config/db');

// ==========================================
// B2C CUSTOMER DASHBOARD
// Role ID: 3
// ==========================================
exports.dashboard = async (req, res) => {
  try {
    const customerId = Number(req.session.user.id);

    // 1. Fetch logged-in B2C customer profile
    const [customers] = await db.execute(
      `SELECT id, name, email, phone, created_at
       FROM users
       WHERE id = ? AND role_id = 3
       LIMIT 1`,
      [customerId]
    );

    if (!customers.length) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied | TM Cosmetic',
        message: 'B2C customer account not found.'
      });
    }

    const customer = customers[0];

    // 2. Fetch customer order statistics
    const [statsRows] = await db.execute(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(
           CASE WHEN order_status = 'Delivered'
           THEN 1 ELSE 0 END
         ), 0) AS delivered_orders,
         COALESCE(SUM(
           CASE WHEN order_status IN (
             'Placed', 'Assigned', 'Accepted', 'Out for Delivery'
           )
           THEN 1 ELSE 0 END
         ), 0) AS active_orders
       FROM orders
       WHERE user_id = ?`,
      [customerId]
    );

    const stats = statsRows[0];

    // 3. Fetch customer's recent orders
    const [orders] = await db.execute(
      `SELECT
         id AS order_id,
         customer_name,
         subtotal,
         delivery_charge,
         total_amount,
         payment_method,
         payment_status,
         order_status,
         created_at
       FROM orders
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 10`,
      [customerId]
    );

    // 4. Fetch items belonging only to this customer's orders
    let items = [];

    if (orders.length > 0) {
      const orderIds = orders.map(order => order.order_id);
      const placeholders = orderIds.map(() => '?').join(',');

      const [itemRows] = await db.execute(
        `SELECT
           oi.id,
           oi.order_id,
           oi.product_id,
           oi.product_name,
           oi.product_image,
           oi.price,
           oi.quantity,
           oi.line_total
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         WHERE o.user_id = ?
           AND oi.order_id IN (${placeholders})
         ORDER BY oi.order_id DESC, oi.id ASC`,
        [customerId, ...orderIds]
      );

      items = itemRows;
    }

    // 5. Group products by order
    const itemsByOrder = {};

    for (const item of items) {
      if (!itemsByOrder[item.order_id]) {
        itemsByOrder[item.order_id] = [];
      }

      itemsByOrder[item.order_id].push(item);
    }

    // 6. Attach products to each order
    const formattedOrders = orders.map(order => ({
      ...order,
      items: itemsByOrder[order.order_id] || []
    }));

    // 7. Render B2C dashboard
    return res.render('b2c/dashboard', {
      title: 'My Dashboard | TM Cosmetic',
      customer,
      user: req.session.user,
      stats,
      orders: formattedOrders
    });

  } catch (error) {
    console.error('B2C dashboard error:', error);

    return res.status(500).send(
      'Unable to load your customer dashboard. Please try again.'
    );
  }
};
