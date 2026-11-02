export function createAuthMiddleware(userStore) {
  return function requireAuth(req, res, next) {
    const token =
      req.headers['x-arc-token'] ||
      req.headers['x-arc-setup-key'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      req.query.token;

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized: Authentication required.',
        code: 'AUTH_REQUIRED'
      });
    }

    const user = userStore.validateSession(token);
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized: Session invalid or expired.',
        code: 'SESSION_EXPIRED'
      });
    }

    req.user = user;
    const changingPassword = req.method === 'POST' && req.path.endsWith('/auth/change-password');
    if (user.mustChangePassword && !changingPassword) {
      return res.status(403).json({ error: 'Change your password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    next();
  };
}

export function requirePermission(permission) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userPerms = req.user.permissions || [];
    if (userPerms.includes('*') || userPerms.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      error: `Forbidden: Missing required permission "${permission}".`,
      code: 'PERMISSION_DENIED'
    });
  };
}
