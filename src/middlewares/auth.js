const jwt = require('jsonwebtoken');
exports.auth = (req, res, next) => {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'No autorizado' }); }
};
exports.soloAdmin = (req, res, next) =>
  req.user.rol === 'admin' ? next() : res.status(403).json({ error: 'Requiere rol administrador' });
