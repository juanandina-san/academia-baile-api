const router = require('express').Router();
const { run } = require('../jobs/estados');

// Vercel Cron envía GET con Authorization: Bearer <CRON_SECRET>.
// Schedulers externos pueden usar POST con x-cron-secret.
const autorizado = req => {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return req.header('authorization') === 'Bearer ' + secreto || req.header('x-cron-secret') === secreto;
};

const ejecutar = async (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ error: 'No autorizado' });
  await run();
  res.json({ ok: true });
};

router.route('/estados').get(ejecutar).post(ejecutar);

module.exports = router;
