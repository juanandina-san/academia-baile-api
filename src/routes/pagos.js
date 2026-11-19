const r = require('express').Router(), db = require('../config/db');
const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'mercadopago', 'otro'];
r.get('/', async (req, res) => {
  const est = req.query.estado || '%';
  const [rows] = await db.execute(`SELECT p.*, a.id alumno_id, CONCAT(a.apellido,', ',a.nombre) alumno, c.nombre clase FROM pagos p
    JOIN inscripciones i ON i.id=p.inscripcion_id JOIN alumnos a ON a.id=i.alumno_id JOIN clases c ON c.id=i.clase_id
    WHERE p.estado LIKE ? ORDER BY p.fecha_vencimiento DESC LIMIT 300`, [est]);
  res.json(rows);
});
r.post('/:id/pagar', async (req, res) => {
  const { metodo_pago, importe } = req.body;
  if (!METODOS.includes(metodo_pago)) return res.status(400).json({ error: 'Método inválido' });
  const [x] = await db.execute(`UPDATE pagos SET estado='pagado',fecha_pago=CURDATE(),metodo_pago=?,importe=COALESCE(?,importe),registrado_por=? WHERE id=? AND estado='pendiente'`,
    [metodo_pago, importe > 0 ? importe : null, req.user.id, req.params.id]);
  if (!x.affectedRows) return res.status(404).json({ error: 'Cuota no pendiente' });
  await db.execute(`UPDATE alumnos a SET estado='activo' WHERE estado='pendiente_pago' AND NOT EXISTS
    (SELECT 1 FROM pagos p JOIN inscripciones i ON i.id=p.inscripcion_id WHERE i.alumno_id=a.id AND p.estado='pendiente' AND p.fecha_vencimiento<CURDATE())`);
  res.json({ ok: true });
});
r.get('/reporte', async (q, res) => res.json((await db.query(
  `SELECT DATE_FORMAT(fecha_pago,'%Y-%m') mes, SUM(importe) total, COUNT(*) cantidad FROM pagos WHERE estado='pagado' GROUP BY mes ORDER BY mes DESC LIMIT 12`))[0]));
module.exports = r;
