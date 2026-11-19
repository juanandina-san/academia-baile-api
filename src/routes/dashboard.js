const r = require('express').Router(), db = require('../config/db');
r.get('/', async (q, res) => {
  const [[a]] = await db.query(`SELECT COUNT(*) total, COALESCE(SUM(estado='activo'),0) activos, COALESCE(SUM(estado='pendiente_pago'),0) pendientes, COALESCE(SUM(estado='inactivo'),0) bajas FROM alumnos`);
  const [[c]] = await db.query(`SELECT COUNT(*) n FROM clases WHERE activa=1`);
  const [[i]] = await db.query(`SELECT COALESCE(SUM(importe),0) total FROM pagos WHERE estado='pagado' AND DATE_FORMAT(fecha_pago,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')`);
  const [[pp]] = await db.query(`SELECT COUNT(*) n, COALESCE(SUM(importe),0) monto FROM pagos WHERE estado='pendiente'`);
  const [prox] = await db.query(`SELECT c.nombre, h.dia_semana, TIME_FORMAT(h.hora_inicio,'%H:%i') hora FROM clase_horarios h JOIN clases c ON c.id=h.clase_id
    WHERE c.activa=1 ORDER BY MOD(CAST(h.dia_semana AS SIGNED) - WEEKDAY(CURDATE()) + 6, 7), h.hora_inicio LIMIT 5`);
  const [ingresos] = await db.query(`SELECT DATE_FORMAT(fecha_pago,'%Y-%m') mes, SUM(importe) total FROM pagos WHERE estado='pagado' GROUP BY mes ORDER BY mes DESC LIMIT 6`);
  const [porClase] = await db.query(`SELECT c.nombre, COUNT(i.id) alumnos FROM clases c LEFT JOIN inscripciones i ON i.clase_id=c.id AND i.estado='activa' WHERE c.activa=1 GROUP BY c.id`);
  res.json({ alumnos: a, clases: c.n, ingresosMes: i.total, pagosPendientes: pp, proximas: prox, ingresos: ingresos.reverse(), porClase });
});
module.exports = r;
