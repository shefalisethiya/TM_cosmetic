
// ==========================================
// ROLE-BASED ACCESS MIDDLEWARE
// TM COSMETIC
// ==========================================

// Check whether user is logged in
exports.requireLogin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  next();
};

// Check allowed roles
exports.requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }

    const roleId = Number(req.session.user.role_id);

    if (!allowedRoles.includes(roleId)) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied | TM Cosmetic',
        message: 'You are not authorized to access this page.'
      });
    }

    next();
  };
};

// ==========================================
// SUPER ADMIN
// Only User ID 1 with role_id 1
// ==========================================
exports.requireSuperAdmin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  const userId = Number(req.session.user.id);
  const roleId = Number(req.session.user.role_id);

  if (userId !== 1 || roleId !== 1) {
    return res.status(403).render('errors/403', {
      title: 'Access Denied | TM Cosmetic',
      message: 'Only the Super Admin can access this page.'
    });
  }

  next();
};

// ==========================================
// ADMIN + SUPER ADMIN
// ==========================================
exports.requireAdmin = (req, res, next) => {
  return exports.requireRole(1, 5)(req, res, next);
};

// ==========================================
// DELIVERY PERSON
// ==========================================
exports.requireDelivery = (req, res, next) => {
  return exports.requireRole(4)(req, res, next);
};

// ==========================================
// B2B USER
// ==========================================
exports.requireB2B = (req, res, next) => {
  return exports.requireRole(2)(req, res, next);
};

// ==========================================
// B2C USER
// ==========================================
exports.requireB2C = (req, res, next) => {
  return exports.requireRole(3)(req, res, next);
};

// ==========================================
// PRODUCT CRUD PERMISSION
// Super Admin, Admin and Delivery Person
// ==========================================
exports.requireProductManagement = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  const roleId = Number(req.session.user.role_id);

  if (![1, 4, 5].includes(roleId)) {
    return res.status(403).render('errors/403', {
      title: 'Access Denied',
      message: 'You do not have permission to manage products.'
    });
  }

  next();
};
