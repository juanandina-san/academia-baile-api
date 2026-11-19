const r = require('express').Router(), db = require('../config/db'), bcrypt = require('bcrypt'), jwt = require('jsonwebtoken');
r.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Datos incompletos' });
  const [[u]] = await db.execute('SELECT * FROM usuarios WHERE email=? AND activo=1', [email]);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'Credenciales inválidas' });
  const token = jwt.sign({ id: u.id, rol: u.rol, nombre: u.nombre }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, nombre: u.nombre, rol: u.rol });
});
module.exports = r;
