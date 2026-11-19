const r = require('express').Router(), db = require('../config/db'), ia = require('../services/ia.service');
r.post('/', async (req, res) => {
  const pregunta = (req.body.pregunta || '').trim();
  if (!pregunta || pregunta.length > 500) return res.status(400).json({ error: 'Pregunta inválida' });
  try {
    const respuesta = await ia.preguntar(pregunta);
    await db.execute('INSERT INTO consultas_ia (usuario_id,pregunta,respuesta) VALUES (?,?,?)', [req.user.id, pregunta, respuesta]);
    res.json({ respuesta });
  } catch (e) { console.error(e); res.status(500).json({ error: 'El asistente no está disponible (revisa ANTHROPIC_API_KEY)' }); }
});
module.exports = r;
