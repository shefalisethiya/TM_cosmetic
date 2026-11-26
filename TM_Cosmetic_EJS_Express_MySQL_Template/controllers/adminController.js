
const db = require('../config/db');

// ==========================================
// ADMIN CONTROLLER
// TM COSMETIC
// ==========================================

// ==========================================
// ADMIN DASHBOARD
// ==========================================
exports.dashboard = async (req, res) => {
  try {
    const [stats] = await db.execute(`
      SELECT
        COUNT(*) AS total_orders,

        SUM(
          CASE
            WHEN order_status = 'Placed' THEN 1
            ELSE 0
          END
        ) AS new_orders,

        SUM(
          CASE
            WHEN delivery_person_id IS NOT NULL
             AND order_status NOT IN ('Delivered', 'Rejected', 'Returned')
            THEN 1
            ELSE 0
          END
        ) AS assigned_orders,

        SUM(
          CASE
            WHEN order_status = 'Delivered' THEN 1
            ELSE 0
          END
        ) AS delivered_orders,

        SUM(
          CASE
            WHEN order_status IN ('Rejected', 'Returned') THEN 1
            ELSE 0
          END
        ) AS returned_orders

      FROM orders
    `);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard | TM Cosmetic',
      stats: stats[0],
      user: req.session.user
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).send('Unable to load Admin dashboard.');
  }
};

// ==========================================
// ADMIN ORDER LIST
// ==========================================
exports.orderList = async (req, res) => {
  try {
    // Fetch all orders with customer and delivery person details.
    const [orders] = await db.execute(`
      SELECT
        o.id AS order_id,
        o.user_id,
        o.customer_name,
        o.mobile,
        o.address,
        o.city,
        o.pincode,
        o.subtotal,
        o.delivery_charge,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.delivery_person_id,
        o.assigned_at,
        o.created_at,

        d.name AS delivery_person_name,
        d.phone AS delivery_person_phone

      FROM orders o

      LEFT JOIN users d
        ON d.id = o.delivery_person_id
       AND d.role_id = 4

      ORDER BY o.created_at DESC, o.id DESC
    `);

    // Fetch products belonging to each order.
    const [items] = await db.execute(`
      SELECT
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.product_name,
        oi.product_image,
        oi.price,
        oi.quantity,
        oi.line_total
      FROM order_items oi
      ORDER BY oi.order_id DESC, oi.id ASC
    `);

    // Group products by order ID.
    const itemsByOrder = {};

    for (const item of items) {
      if (!itemsByOrder[item.order_id]) {
        itemsByOrder[item.order_id] = [];
      }

      itemsByOrder[item.order_id].push(item);
    }

    // Attach products to each order.
    const formattedOrders = orders.map(order => ({
      ...order,
      items: itemsByOrder[order.order_id] || []
    }));

    // Fetch Delivery Person accounts.
    const [deliveryPersons] = await db.execute(`
      SELECT
        id,
        name,
        phone,
        email
      FROM users
      WHERE role_id = 4
      ORDER BY name ASC
    `);

    res.render('admin/orders', {
      title: 'Manage Orders | TM Cosmetic',
      orders: formattedOrders,
      deliveryPersons,
      user: req.session.user,
      assigned: req.query.assigned === '1',
      error: req.query.error || null
    });

  } catch (error) {
    console.error('Admin order list error:', error);
    res.status(500).send('Unable to load orders.');
  }
};

// ==========================================
// ASSIGN DELIVERY PERSON TO ORDER
// ==========================================
exports.assignDelivery = async (req, res) => {
  const orderId = Number(req.params.id);
  const deliveryPersonId = Number(req.body.delivery_person_id);

  try {
    // Validate order ID.
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).send('Invalid order ID.');
    }

    // Validate Delivery Person ID.
    if (
      !Number.isInteger(deliveryPersonId) ||
      deliveryPersonId <= 0
    ) {
      return res.status(400).send('Please select a valid Delivery Person.');
    }

    // Verify Delivery Person exists and has role ID 4.
    const [deliveryPersons] = await db.execute(
      `
        SELECT id, name
        FROM users
        WHERE id = ?
          AND role_id = 4
        LIMIT 1
      `,
      [deliveryPersonId]
    );

    if (deliveryPersons.length === 0) {
      return res.status(400).send(
        'Selected account is not a valid Delivery Person.'
      );
    }

    // Check whether order exists and is eligible for assignment.
    const [orders] = await db.execute(
      `
        SELECT
          id,
          order_status,
          payment_status
        FROM orders
        WHERE id = ?
        LIMIT 1
      `,
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).send('Order not found.');
    }

    const order = orders[0];

    // Do not assign unpaid online orders.
    if (order.order_status === 'Pending Payment') {
      return res.status(400).send(
        'This order cannot be assigned because payment is pending.'
      );
    }

    // Only allow assignment for eligible order statuses.
    const eligibleStatuses = ['Placed', 'Assigned'];

    if (!eligibleStatuses.includes(order.order_status)) {
      return res.status(400).send(
        'This order cannot be assigned in its current status.'
      );
    }

    // Assign Delivery Person.
    const [result] = await db.execute(
      `
        UPDATE orders
        SET
          delivery_person_id = ?,
          assigned_at = CURRENT_TIMESTAMP,
          order_status = 'Assigned'
        WHERE id = ?
          AND order_status IN ('Placed', 'Assigned')
          AND order_status <> 'Pending Payment'
      `,
      [deliveryPersonId, orderId]
    );

    if (result.affectedRows === 0) {
      return res.status(409).send(
        'Order assignment failed. Please refresh and try again.'
      );
    }

    console.log(
      `Order ${orderId} assigned to Delivery Person ${deliveryPersonId}`
    );

    return res.redirect('/admin/orders?assigned=1');

  } catch (error) {
    console.error('Assign delivery error:', error);

    return res.status(500).send(
      'Unable to assign Delivery Person. Please try again.'
    );
  }
};

// ==========================================
// EXPORTS
// ==========================================
