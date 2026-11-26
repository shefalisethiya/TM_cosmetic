
const db = require('../config/db');

// ==========================================
// DELIVERY PERSON: ALLOWED STATUS TRANSITIONS
// Role ID: 4
// ==========================================
const STATUS_TRANSITIONS = {
  assigned: ['Accepted', 'Rejected'],
  accepted: ['Out for Delivery', 'Rejected'],
  'out for delivery': ['Delivered', 'Rejected', 'Returned']
};

// ==========================================
// COMMON FUNCTION: GET LOGGED-IN DELIVERY PERSON
// ==========================================
const getDeliveryPerson = async (deliveryPersonId) => {
  const [users] = await db.execute(
    `SELECT
       id,
       name,
       email,
       phone,
       role_id,
       created_at
     FROM users
     WHERE id = ?
       AND role_id = 4
     LIMIT 1`,
    [deliveryPersonId]
  );

  return users[0] || null;
};

// ==========================================
// COMMON FUNCTION: ATTACH ORDER ITEMS
// ==========================================
const attachOrderItems = async (orders) => {
  if (!Array.isArray(orders) || orders.length === 0) {
    return [];
  }

  const orderIds = orders.map(order => order.id);
  const placeholders = orderIds.map(() => '?').join(',');

  const [items] = await db.execute(
    `SELECT
       id,
       order_id,
       product_id,
       product_name,
       product_image,
       price,
       quantity,
       line_total
     FROM order_items
     WHERE order_id IN (${placeholders})
     ORDER BY order_id DESC, id ASC`,
    orderIds
  );

  const itemsByOrder = {};

  for (const item of items) {
    if (!itemsByOrder[item.order_id]) {
      itemsByOrder[item.order_id] = [];
    }

    itemsByOrder[item.order_id].push(item);
  }

  return orders.map(order => ({
    ...order,
    items: itemsByOrder[order.id] || []
  }));
};

// ==========================================
// DELIVERY PERSON DASHBOARD
// GET /delivery/dashboard
// Role ID: 4
// ==========================================
exports.dashboard = async (req, res) => {
  try {
    const deliveryPersonId = Number(req.session?.user?.id);

    if (!Number.isInteger(deliveryPersonId) || deliveryPersonId <= 0) {
      return res.redirect('/login');
    }

    // VERIFY DELIVERY PERSON
    const deliveryPerson = await getDeliveryPerson(deliveryPersonId);

    if (!deliveryPerson) {
      return res.status(403).send(
        'Delivery person account not found.'
      );
    }

    // ======================================
    // FETCH ONLY ASSIGNED ORDERS
    // ======================================
    const [orders] = await db.execute(
      `SELECT
         id,
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
         order_status,
         delivery_status_reason,
         delivery_status_updated_at,
         delivery_person_id,
         assigned_at,
         created_at

       FROM orders

       WHERE delivery_person_id = ?

       ORDER BY
         CASE
           WHEN LOWER(order_status) = 'assigned' THEN 1
           WHEN LOWER(order_status) = 'accepted' THEN 2
           WHEN LOWER(order_status) = 'out for delivery' THEN 3
           WHEN LOWER(order_status) = 'delivered' THEN 4
           ELSE 5
         END,
         assigned_at DESC,
         id DESC`,
      [deliveryPersonId]
    );

    // ======================================
    // ATTACH ORDER ITEMS
    // ======================================
    const formattedOrders = await attachOrderItems(orders);

    // ======================================
    // DASHBOARD STATISTICS
    // ======================================
    const [statsRows] = await db.execute(
      `SELECT
         COUNT(*) AS total_orders,

         COALESCE(SUM(
           CASE
             WHEN LOWER(order_status) = 'assigned'
             THEN 1 ELSE 0
           END
         ), 0) AS assigned_orders,

         COALESCE(SUM(
           CASE
             WHEN LOWER(order_status) = 'accepted'
             THEN 1 ELSE 0
           END
         ), 0) AS accepted_orders,

         COALESCE(SUM(
           CASE
             WHEN LOWER(order_status) = 'out for delivery'
             THEN 1 ELSE 0
           END
         ), 0) AS out_for_delivery,

         COALESCE(SUM(
           CASE
             WHEN LOWER(order_status) = 'delivered'
             THEN 1 ELSE 0
           END
         ), 0) AS delivered_orders,

         COALESCE(SUM(
           CASE
             WHEN LOWER(order_status) IN ('rejected', 'returned')
             THEN 1 ELSE 0
           END
         ), 0) AS rejected_returned_orders

       FROM orders
       WHERE delivery_person_id = ?`,
      [deliveryPersonId]
    );

    const stats = statsRows[0];

    // ======================================
    // RENDER DELIVERY DASHBOARD
    // ======================================
    return res.render('delivery/dashboard', {
      title: 'Delivery Dashboard | TM Cosmetic',
      user: req.session.user,
      deliveryPerson,
      stats,
      orders: formattedOrders
    });

  } catch (error) {
    console.error('Delivery dashboard error:', error);

    return res.status(500).send(
      'Unable to load delivery dashboard. Please try again.'
    );
  }
};

// ==========================================
// UPDATE DELIVERY ORDER STATUS
// POST /delivery/orders/:id/status
// Role ID: 4
// ==========================================
exports.updateStatus = async (req, res) => {
  try {
    const deliveryPersonId = Number(req.session?.user?.id);
    const orderId = Number(req.params.id);

    if (!Number.isInteger(deliveryPersonId) || deliveryPersonId <= 0) {
      return res.redirect('/login');
    }

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).send('Invalid order ID.');
    }

    // VERIFY DELIVERY PERSON
    const deliveryPerson = await getDeliveryPerson(deliveryPersonId);

    if (!deliveryPerson) {
      return res.status(403).send(
        'Delivery person account not found.'
      );
    }

    // GET REQUESTED STATUS
    const requestedStatus = String(
      req.body.status || req.body.order_status || ''
    ).trim();

    const allowedStatuses = [
      'Accepted',
      'Out for Delivery',
      'Delivered',
      'Rejected',
      'Returned'
    ];

    const newStatus = allowedStatuses.find(
      status => status.toLowerCase() === requestedStatus.toLowerCase()
    );

    if (!newStatus) {
      return res.status(400).send('Invalid delivery status.');
    }

    // ======================================
    // GET ORDER ASSIGNED TO THIS PERSON
    // ======================================
    const [orders] = await db.execute(
      `SELECT
         id,
         delivery_person_id,
         order_status,
         delivery_status_reason
       FROM orders
       WHERE id = ?
         AND delivery_person_id = ?
       LIMIT 1`,
      [orderId, deliveryPersonId]
    );

    if (orders.length === 0) {
      return res.status(404).send(
        'Order not found or not assigned to you.'
      );
    }

    const order = orders[0];
    const currentStatus = String(order.order_status || '')
      .trim()
      .toLowerCase();

    // ======================================
    // VALIDATE STATUS TRANSITION
    // ======================================
    const permittedTransitions =
      STATUS_TRANSITIONS[currentStatus] || [];

    const isAllowed = permittedTransitions.some(
      status => status.toLowerCase() === newStatus.toLowerCase()
    );

    if (!isAllowed) {
      return res.status(400).send(
        `Cannot change order status from "${order.order_status}" to "${newStatus}".`
      );
    }

    // ======================================
    // REASON FOR REJECTED / RETURNED
    // ======================================
    let reason = null;

    if (['Rejected', 'Returned'].includes(newStatus)) {
      reason = String(req.body.reason || '').trim();

      if (!reason) {
        return res.status(400).send(
          'Please provide a reason for rejecting or returning this order.'
        );
      }

      if (reason.length > 255) {
        return res.status(400).send(
          'Reason cannot exceed 255 characters.'
        );
      }
    }

    // ======================================
    // UPDATE ORDER STATUS
    // Conditional update prevents overwriting
    // a status changed by another request.
    // ======================================
    const [result] = await db.execute(
      `UPDATE orders
       SET
         order_status = ?,
         delivery_status_reason = ?,
         delivery_status_updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND delivery_person_id = ?
         AND LOWER(order_status) = ?`,
      [
        newStatus,
        reason,
        orderId,
        deliveryPersonId,
        currentStatus
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(409).send(
        'Order status has changed. Please refresh the dashboard and try again.'
      );
    }

    // ======================================
    // REDIRECT AFTER SUCCESSFUL UPDATE
    // ======================================
    return res.redirect(
      '/delivery/dashboard?success=' +
      encodeURIComponent(`Order #${orderId} updated to ${newStatus}.`)
    );

  } catch (error) {
    console.error('Delivery status update error:', error);

    return res.status(500).send(
      'Unable to update order status. Please try again.'
    );
  }
};
