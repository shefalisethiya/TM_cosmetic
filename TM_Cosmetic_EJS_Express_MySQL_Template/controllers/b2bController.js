
const db = require('../config/db');

// ==========================================
// COMMON FUNCTION: GET B2B CUSTOMER
// ==========================================
const getB2BCustomer = async (customerId) => {
  const [customers] = await db.execute(
    `SELECT
       id,
       name,
       email,
       phone,
       joinas,
       created_at
     FROM users
     WHERE id = ?
       AND role_id = 2
     LIMIT 1`,
    [customerId]
  );

  return customers[0] || null;
};

// ==========================================
// COMMON FUNCTION: FETCH ORDER ITEMS
// ==========================================
const attachOrderItems = async (customerId, orders) => {
  if (!Array.isArray(orders) || orders.length === 0) {
    return [];
  }

  const orderIds = orders.map(order => order.order_id);
  const placeholders = orderIds.map(() => '?').join(',');

  const [items] = await db.execute(
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
     INNER JOIN orders o
       ON o.id = oi.order_id
     WHERE o.user_id = ?
       AND oi.order_id IN (${placeholders})
     ORDER BY oi.order_id DESC, oi.id ASC`,
    [customerId, ...orderIds]
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
    items: itemsByOrder[order.order_id] || []
  }));
};

// ==========================================
// COMMON FUNCTION: GET ORDER FILTER
// ==========================================
const getOrderFilter = (requestedFilter) => {
  const filter = String(requestedFilter || 'total').toLowerCase();

  switch (filter) {
    case 'active':
      return {
        filter: 'active',
        filterLabel: 'Active Orders',
        condition: `AND LOWER(order_status) IN (
          'placed',
          'assigned',
          'accepted',
          'out for delivery'
        )`
      };

    case 'delivered':
      return {
        filter: 'delivered',
        filterLabel: 'Delivered Orders',
        condition: `AND LOWER(order_status) = 'delivered'`
      };

    case 'pending-payment':
      return {
        filter: 'pending-payment',
        filterLabel: 'Pending Payments',
        condition: `AND LOWER(payment_status) LIKE 'pending%'`
      };

    default:
      return {
        filter: 'total',
        filterLabel: 'All Orders',
        condition: ''
      };
  }
};

// ==========================================
// COMMON FUNCTION: VALIDATE B2B CUSTOMER
// ==========================================
const validateB2BCustomer = async (req, res) => {
  const customerId = Number(req.session?.user?.id);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    res.redirect('/login');
    return null;
  }

  const customer = await getB2BCustomer(customerId);

  if (!customer) {
    res.status(403).send('B2B customer account not found.');
    return null;
  }

  return {
    customerId,
    customer
  };
};

// ==========================================
// B2B CUSTOMER DASHBOARD
// Role ID: 2
// ==========================================
exports.dashboard = async (req, res) => {
  try {
    const validated = await validateB2BCustomer(req, res);

    if (!validated) return;

    const { customerId, customer } = validated;

    // ======================================
    // ORDER STATISTICS
    // ======================================
    const [statsRows] = await db.execute(
      `SELECT
         COUNT(*) AS total_orders,

         COALESCE(SUM(
           CASE
             WHEN LOWER(order_status) = 'delivered'
             THEN 1 ELSE 0
           END
         ), 0) AS delivered_orders,

         COALESCE(SUM(
           CASE
             WHEN LOWER(order_status) IN (
               'placed',
               'assigned',
               'accepted',
               'out for delivery'
             )
             THEN 1 ELSE 0
           END
         ), 0) AS active_orders,

         COALESCE(SUM(
           CASE
             WHEN LOWER(payment_status) LIKE 'pending%'
             THEN 1 ELSE 0
           END
         ), 0) AS pending_payments

       FROM orders
       WHERE user_id = ?`,
      [customerId]
    );

    const stats = statsRows[0];

    // ======================================
    // LATEST 10 ORDERS
    // ======================================
    const [orders] = await db.execute(
      `SELECT
         id AS order_id,
         customer_name,
         mobile,
         subtotal,
         delivery_charge,
         total_amount,
         payment_method,
         payment_status,
         order_status,
         delivery_status_reason,
         created_at
       FROM orders
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 10`,
      [customerId]
    );

    const formattedOrders = await attachOrderItems(
      customerId,
      orders
    );

    // ======================================
    // AVAILABLE PRODUCT COUNT
    // ======================================
    const [productRows] = await db.execute(
      `SELECT COUNT(*) AS total_products
       FROM tm_cosmetics_stocks
       WHERE stock > 0`
    );

    const productStats = productRows[0];

    // ======================================
    // RENDER DASHBOARD
    // ======================================
    return res.render('b2b/dashboard', {
      title: 'B2B Dashboard | TM Cosmetic',
      customer,
      user: req.session.user,
      stats,
      productStats,
      orders: formattedOrders
    });

  } catch (error) {
    console.error('B2B dashboard error:', error);

    return res.status(500).send(
      'Unable to load your B2B dashboard. Please try again.'
    );
  }
};

// ==========================================
// B2B CUSTOMER MY ORDERS
// Role ID: 2
// ==========================================
exports.orders = async (req, res) => {
  try {
    const validated = await validateB2BCustomer(req, res);

    if (!validated) return;

    const { customerId, customer } = validated;

    // ======================================
    // GET SELECTED FILTER
    // ======================================
    const selected = getOrderFilter(req.query.filter);

    // ======================================
    // FETCH FILTERED CUSTOMER ORDERS
    // ======================================
    const [orders] = await db.execute(
      `SELECT
         id AS order_id,
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
         created_at
       FROM orders
       WHERE user_id = ?
       ${selected.condition}
       ORDER BY created_at DESC, id DESC`,
      [customerId]
    );

    // ======================================
    // ATTACH ORDER ITEMS
    // ======================================
    const formattedOrders = await attachOrderItems(
      customerId,
      orders
    );

    // ======================================
    // RENDER ORDERS PAGE
    // ======================================
    return res.render('b2b/orders', {
      title: `${selected.filterLabel} | TM Cosmetic`,
      customer,
      user: req.session.user,
      orders: formattedOrders,
      filter: selected.filter,
      filterLabel: selected.filterLabel
    });

  } catch (error) {
    console.error('B2B orders error:', error);

    return res.status(500).send(
      'Unable to load your orders. Please try again.'
    );
  }
};
