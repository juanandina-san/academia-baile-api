const r = require('express').Router(), db = require('../config/db'), { soloAdmin } = require('../middlewares/auth');
const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
// Se mantiene /api/clases/profesores como alias histórico del CRUD de profesores.
r.use('/profesores', require('./profesores'));
r.get('/', async (q, res) => {
  const [rows] = await db.query(`SELECT c.*, CONCAT(p.nombre,' ',p.apellido) profesor,
    (SELECT COUNT(*) FROM inscripciones i WHERE i.clase_id=c.id AND i.estado='activa') inscriptos,
    (SELECT GROUP_CONCAT(CONCAT(dia_semana,'|',TIME_FORMAT(hora_inicio,'%H:%i'),'-',TIME_FORMAT(hora_fin,'%H:%i')) SEPARATOR ', ') FROM clase_horarios h WHERE h.clase_id=c.id) horarios
    FROM clases c JOIN profesores p ON p.id=c.profesor_id WHERE c.activa=1 ORDER BY c.nombre`);
  rows.forEach(c => {
  const lista = (c.horarios || '').split(', ').filter(Boolean).map(h => { const [d, t] = h.split('|'); const [i, f] = t.split('-'); return { dia: +d, inicio: i, fin: f }; });
  c.horarios_lista = lista;
  c.horarios = lista.map(h => `${DIAS[h.dia]} ${h.inicio}-${h.fin}`).join(', ');
});
  res.json(rows);
});
r.post('/', soloAdmin, async (req, res) => {
  const { nombre, profesor_id, precio, cupo_maximo, horarios = [] } = req.body;
  if (!nombre || !profesor_id || !(precio >= 0) || !(cupo_maximo > 0)) return res.status(400).json({ error: 'Datos inválidos' });
  const [x] = await db.execute('INSERT INTO clases (nombre,profesor_id,precio,cupo_maximo) VALUES (?,?,?,?)', [nombre, profesor_id, precio, cupo_maximo]);
  for (const h of horarios) await db.execute('INSERT INTO clase_horarios (clase_id,dia_semana,hora_inicio,hora_fin) VALUES (?,?,?,?)', [x.insertId, h.dia, h.inicio, h.fin]);
  res.status(201).json({ id: x.insertId });
});
r.get('/:id/alumnos', async (req, res) => res.json((await db.execute(
  `SELECT a.id,a.nombre,a.apellido,a.dni,a.estado,i.id inscripcion_id FROM inscripciones i JOIN alumnos a ON a.id=i.alumno_id WHERE i.clase_id=? AND i.estado='activa'`, [req.params.id]))[0]));
r.post('/:id/inscribir', async (req, res) => {
  const cid = req.params.id, aid = req.body.alumno_id;
  const [[c]] = await db.execute(`SELECT cupo_maximo,(SELECT COUNT(*) FROM inscripciones WHERE clase_id=? AND estado='activa') n FROM clases WHERE id=?`, [cid, cid]);
  if (!c) return res.status(404).json({ error: 'Clase no encontrada' });
  if (c.n >= c.cupo_maximo) return res.status(409).json({ error: 'Cupo completo' });
  await db.execute(`INSERT INTO inscripciones (alumno_id,clase_id) VALUES (?,?) ON DUPLICATE KEY UPDATE estado='activa',fecha_baja=NULL`, [aid, cid]);
  await require('../services/pagos.service').generarCuotas();
  res.status(201).json({ ok: true });
});
r.delete('/inscripciones/:id', async (req, res) => {
  await db.execute(`UPDATE inscripciones SET estado='baja',fecha_baja=CURDATE() WHERE id=?`, [req.params.id]);
  res.json({ ok: true });
});
r.put('/:id', soloAdmin, async (req, res) => {
  const { nombre, profesor_id, precio, cupo_maximo, dia, inicio, fin } = req.body;
  if (!nombre || !profesor_id || !(+precio >= 0) || !(+cupo_maximo > 0)) return res.status(400).json({ error: 'Datos inválidos' });
  if (!dia || !inicio || !fin || fin <= inicio) return res.status(400).json({ error: 'El horario de fin debe ser posterior al de inicio' });
  const [[c]] = await db.execute(`SELECT COUNT(*) n FROM inscripciones WHERE clase_id=? AND estado='activa'`, [req.params.id]);
  if (+cupo_maximo < c.n) return res.status(409).json({ error: `El cupo no puede ser menor a los ${c.n} alumnos inscriptos` });
  await db.execute('UPDATE clases SET nombre=?,profesor_id=?,precio=?,cupo_maximo=? WHERE id=?', [nombre, profesor_id, precio, cupo_maximo, req.params.id]);
  await db.execute('DELETE FROM clase_horarios WHERE clase_id=?', [req.params.id]);
  await db.execute('INSERT INTO clase_horarios (clase_id,dia_semana,hora_inicio,hora_fin) VALUES (?,?,?,?)', [req.params.id, dia, inicio, fin]);
  res.json({ ok: true });
});
// "Eliminar" = baja lógica: la clase se oculta pero se conserva su historial
r.delete('/:id', soloAdmin, async (req, res) => {
  const [[c]] = await db.execute(`SELECT COUNT(*) n FROM inscripciones WHERE clase_id=? AND estado='activa'`, [req.params.id]);
  if (c.n > 0) return res.status(409).json({ error: `Tiene ${c.n} alumnos inscriptos. Quitalos primero desde "Alumnos".` });
  await db.execute('UPDATE clases SET activa=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});
module.exports = r;
