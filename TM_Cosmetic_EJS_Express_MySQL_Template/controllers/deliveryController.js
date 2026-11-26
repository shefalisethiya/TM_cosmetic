
const db = require('../config/db');

// ==========================================
// DELIVERY PERSON DASHBOARD
// Show only orders assigned to logged-in user
// ==========================================
exports.dashboard = async (req, res) => {
  try {
    const deliveryPersonId = Number(req.session.user.id);

    const [orders] = await db.execute(
      `
      SELECT
        o.id AS order_id,
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
        o.delivery_status_reason,
        o.delivery_status_updated_at,
        o.assigned_at,
        o.created_at
      FROM orders o
      WHERE o.delivery_person_id = ?
      ORDER BY o.assigned_at DESC, o.id DESC
      `,
      [deliveryPersonId]
    );

    const [items] = await db.execute(
      `
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
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE o.delivery_person_id = ?
      ORDER BY oi.order_id DESC, oi.id ASC
      `,
      [deliveryPersonId]
    );

    const itemsByOrder = {};

    for (const item of items) {
      if (!itemsByOrder[item.order_id]) {
        itemsByOrder[item.order_id] = [];
      }

      itemsByOrder[item.order_id].push(item);
    }

    const formattedOrders = orders.map(order => ({
      ...order,
      items: itemsByOrder[order.order_id] || []
    }));

    res.render('delivery/dashboard', {
      title: 'Delivery Dashboard | TM Cosmetic',
      orders: formattedOrders,
      user: req.session.user,
      error: req.query.error || null,
      success: req.query.success || null
    });

  } catch (error) {
    console.error('Delivery dashboard error:', error);

    res.status(500).send('Unable to load delivery dashboard.');
  }
};


// ==========================================
// UPDATE DELIVERY ORDER STATUS
// Delivery Person can update only own orders
// ==========================================
exports.updateStatus = async (req, res) => {
  const orderId = Number(req.params.id);
  const deliveryPersonId = Number(req.session.user.id);

  const newStatus = String(req.body.order_status || '').trim();
  const reason = String(req.body.delivery_status_reason || '').trim();

  const allowedStatuses = [
    'Accepted',
    'Out for Delivery',
    'Delivered',
    'Rejected',
    'Returned'
  ];

  const allowedTransitions = {
    'Assigned': ['Accepted', 'Rejected'],
    'Accepted': ['Out for Delivery', 'Rejected'],
    'Out for Delivery': ['Delivered', 'Rejected', 'Returned']
  };

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.redirect('/delivery/dashboard?error=invalid_order');
  }

  if (!allowedStatuses.includes(newStatus)) {
    return res.redirect('/delivery/dashboard?error=invalid_status');
  }

  if (
    ['Rejected', 'Returned'].includes(newStatus) &&
    !reason
  ) {
    return res.redirect('/delivery/dashboard?error=reason_required');
  }

  if (reason.length > 255) {
    return res.redirect('/delivery/dashboard?error=reason_too_long');
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock the order and verify that it belongs to this delivery person.
    const [rows] = await connection.execute(
      `
      SELECT id, order_status
      FROM orders
      WHERE id = ?
        AND delivery_person_id = ?
      FOR UPDATE
      `,
      [orderId, deliveryPersonId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.redirect('/delivery/dashboard?error=order_not_found');
    }

    const currentStatus = rows[0].order_status;
    const permittedNextStatuses = allowedTransitions[currentStatus] || [];

    if (!permittedNextStatuses.includes(newStatus)) {
      await connection.rollback();
      return res.redirect('/delivery/dashboard?error=invalid_transition');
    }

    await connection.execute(
      `
      UPDATE orders
      SET
        order_status = ?,
        delivery_status_reason = ?,
        delivery_status_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND delivery_person_id = ?
      `,
      [
        newStatus,
        ['Rejected', 'Returned'].includes(newStatus) ? reason : null,
        orderId,
        deliveryPersonId
      ]
    );

    await connection.commit();

    return res.redirect('/delivery/dashboard?success=updated');

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error('Delivery status update error:', error);

    return res.redirect('/delivery/dashboard?error=update_failed');

  } finally {
    if (connection) {
      connection.release();
    }
  }
};

