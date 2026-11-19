const r = require('express').Router(),
  db = require('../config/db'),
  { soloAdmin } = require('../middlewares/auth');

/* Normaliza el flag activo que puede llegar como 1/'1'/true o 0/'0'/false. */
const bandera = v => {
  if (v === undefined || v === null || v === '') return null;
  if ([1, '1', true, 'true'].includes(v)) return 1;
  if ([0, '0', false, 'false'].includes(v)) return 0;
  return NaN;
};

const texto = v => (typeof v === 'string' ? v.trim() : '');

const validar = b => {
  if (!texto(b.nombre) || !texto(b.apellido)) return 'Nombre y apellido obligatorios';
  const email = texto(b.email);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return 'Email inválido';
};

const contarClases = async (id, soloActivas = false) => {
  const [[x]] = await db.execute(
    `SELECT COUNT(*) n FROM clases WHERE profesor_id=?${soloActivas ? ' AND activa=1' : ''}`,
    [id]
  );
  return x.n;
};

/* Listado con búsqueda y filtro por estado.
   Por defecto solo activos para no cambiar el contrato de /api/clases/profesores. */
r.get('/', async (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const estado = req.query.estado || 'activos';
  const activo = estado === 'todos' ? null : estado === 'inactivos' ? 0 : 1;
  const [rows] = await db.execute(
    `SELECT p.*,
       (SELECT COUNT(*) FROM clases c WHERE c.profesor_id=p.id AND c.activa=1) clases,
       (SELECT COUNT(DISTINCT i.alumno_id) FROM clases c
          JOIN inscripciones i ON i.clase_id=c.id AND i.estado='activa'
        WHERE c.profesor_id=p.id AND c.activa=1) alumnos
     FROM profesores p
     WHERE (p.nombre LIKE ? OR p.apellido LIKE ? OR p.email LIKE ?)
       AND (? IS NULL OR p.activo=?)
     ORDER BY p.apellido, p.nombre`,
    [q, q, q, activo, activo]
  );
  res.json(rows);
});

/* Ficha con las clases a cargo (activas e históricas). */
r.get('/:id', async (req, res) => {
  const [[p]] = await db.execute('SELECT * FROM profesores WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Profesor no encontrado' });
  const [clases] = await db.execute(
    `SELECT c.id, c.nombre, c.precio, c.cupo_maximo, c.activa,
       (SELECT COUNT(*) FROM inscripciones i WHERE i.clase_id=c.id AND i.estado='activa') inscriptos
     FROM clases c WHERE c.profesor_id=? ORDER BY c.activa DESC, c.nombre`,
    [p.id]
  );
  res.json({ ...p, clases });
});

r.post('/', soloAdmin, async (req, res) => {
  const b = req.body || {};
  const e = validar(b);
  if (e) return res.status(400).json({ error: e });
  const [x] = await db.execute(
    'INSERT INTO profesores (nombre,apellido,telefono,email) VALUES (?,?,?,?)',
    [texto(b.nombre), texto(b.apellido), texto(b.telefono) || null, texto(b.email) || null]
  );
  res.status(201).json({ id: x.insertId });
});

r.put('/:id', soloAdmin, async (req, res) => {
  const b = req.body || {};
  const e = validar(b);
  if (e) return res.status(400).json({ error: e });
  const activo = bandera(b.activo);
  if (Number.isNaN(activo)) return res.status(400).json({ error: 'Estado inválido' });

  const [[p]] = await db.execute('SELECT id FROM profesores WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Profesor no encontrado' });
  if (activo === 0) {
    const n = await contarClases(p.id, true);
    if (n > 0)
      return res.status(409).json({
        error: `Tiene ${n} clase(s) activa(s). Reasigná esas clases antes de darlo de baja.`
      });
  }

  await db.execute(
    'UPDATE profesores SET nombre=?,apellido=?,telefono=?,email=?,activo=COALESCE(?,activo) WHERE id=?',
    [
      texto(b.nombre),
      texto(b.apellido),
      texto(b.telefono) || null,
      texto(b.email) || null,
      activo,
      p.id
    ]
  );
  res.json({ ok: true });
});

/* Baja lógica: se conserva el historial de clases dictadas. */
r.delete('/:id', soloAdmin, async (req, res) => {
  const [[p]] = await db.execute('SELECT id FROM profesores WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Profesor no encontrado' });
  const n = await contarClases(p.id, true);
  if (n > 0)
    return res.status(409).json({
      error: `Tiene ${n} clase(s) activa(s). Reasigná esas clases antes de darlo de baja.`
    });
  await db.execute('UPDATE profesores SET activo=0 WHERE id=?', [p.id]);
  res.json({ ok: true });
});

/* Eliminación definitiva: solo si nunca tuvo clases (la FK lo impide igual). */
r.delete('/:id/definitivo', soloAdmin, async (req, res) => {
  const n = await contarClases(req.params.id);
  if (n > 0)
    return res.status(409).json({
      error: 'No se puede eliminar: tiene clases asociadas. Usá Baja para conservar el historial.'
    });
  const [x] = await db.execute('DELETE FROM profesores WHERE id=?', [req.params.id]);
  if (!x.affectedRows) return res.status(404).json({ error: 'Profesor no encontrado' });
  res.json({ ok: true });
});

module.exports = r;
