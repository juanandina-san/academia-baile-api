const r = require('express').Router(), db = require('../config/db'), { soloAdmin } = require('../middlewares/auth');
const validar = (b) => {
  if (!b.nombre?.trim() || !b.apellido?.trim()) return 'Nombre y apellido obligatorios';
  if (!/^\d{6,10}$/.test(b.dni || '')) return 'DNI inválido (6 a 10 dígitos)';
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return 'Email inválido';
};
r.get('/', async (req, res) => {
  const q = `%${req.query.q || ''}%`, est = req.query.estado || '%';
  const [rows] = await db.execute(`SELECT * FROM alumnos WHERE (nombre LIKE ? OR apellido LIKE ? OR dni LIKE ?) AND estado LIKE ? ORDER BY apellido,nombre`, [q, q, q, est]);
  res.json(rows);
});
r.get('/:id', async (req, res) => {
  const [[a]] = await db.execute('SELECT * FROM alumnos WHERE id=?', [req.params.id]);
  if (!a) return res.status(404).json({ error: 'No encontrado' });
  const [clases] = await db.execute(`SELECT i.id inscripcion_id, c.nombre, i.estado FROM inscripciones i JOIN clases c ON c.id=i.clase_id WHERE i.alumno_id=?`, [a.id]);
  const [pagos] = await db.execute(`SELECT p.*, c.nombre clase FROM pagos p JOIN inscripciones i ON i.id=p.inscripcion_id JOIN clases c ON c.id=i.clase_id WHERE i.alumno_id=? ORDER BY p.periodo DESC`, [a.id]);
  res.json({ ...a, clases, pagos });
});
r.post('/', async (req, res) => {
  const e = validar(req.body); if (e) return res.status(400).json({ error: e });
  const { nombre, apellido, dni, telefono, email } = req.body;
  try {
    const [x] = await db.execute('INSERT INTO alumnos (nombre,apellido,dni,telefono,email) VALUES (?,?,?,?,?)', [nombre.trim(), apellido.trim(), dni, telefono || null, email || null]);
    res.status(201).json({ id: x.insertId });
  } catch (err) { if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DNI ya registrado' }); throw err; }
});
r.put('/:id', async (req, res) => {
  const e = validar(req.body); if (e) return res.status(400).json({ error: e });
  const { nombre, apellido, dni, telefono, email, estado } = req.body;
  if (estado && !['activo', 'pendiente_pago', 'inactivo'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  await db.execute(`UPDATE alumnos SET nombre=?,apellido=?,dni=?,telefono=?,email=?,estado=COALESCE(?,estado),
    fecha_baja=CASE WHEN ?='inactivo' THEN COALESCE(fecha_baja,CURDATE()) WHEN ? IS NULL THEN fecha_baja ELSE NULL END WHERE id=?`,
    [nombre, apellido, dni, telefono || null, email || null, estado || null, estado || '', estado || null, req.params.id]);
  res.json({ ok: true });
});
// Baja lógica: nunca se borra el registro
r.delete('/:id', soloAdmin, async (req, res) => {
  await db.execute(`UPDATE alumnos SET estado='inactivo', fecha_baja=CURDATE() WHERE id=?`, [req.params.id]);
  await db.execute(`UPDATE inscripciones SET estado='baja', fecha_baja=CURDATE() WHERE alumno_id=? AND estado='activa'`, [req.params.id]);
  res.json({ ok: true });
});
// Eliminación definitiva: solo si no tiene historial
r.delete('/:id/definitivo', soloAdmin, async (req, res) => {
  const [[x]] = await db.execute('SELECT COUNT(*) n FROM inscripciones WHERE alumno_id=?', [req.params.id]);
  if (x.n > 0) return res.status(409).json({ error: 'No se puede eliminar: tiene inscripciones o pagos. Usá Baja para conservar su historial.' });
  await db.execute('DELETE FROM alumnos WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});
module.exports = r;
