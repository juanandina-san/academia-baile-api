require('dotenv').config();
require('express-async-errors');
const express = require('express'), path = require('path'), fs = require('fs'), helmet = require('helmet'), cors = require('cors'), rate = require('express-rate-limit');
const { auth } = require('./middlewares/auth');
const app = express();
app.set('trust proxy', 1);
const origenes = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean) : true;
app.use(helmet({ contentSecurityPolicy: false }), cors({ origin: origenes }), express.json({ limit: '100kb' }));
app.use('/api/auth', rate({ windowMs: 15 * 60 * 1000, max: 20 }), require('./routes/auth'));
app.use('/api/alumnos', auth, require('./routes/alumnos'));
app.use('/api/profesores', auth, require('./routes/profesores'));
app.use('/api/clases', auth, require('./routes/clases'));
app.use('/api/pagos', auth, require('./routes/pagos'));
app.use('/api/dashboard', auth, require('./routes/dashboard'));
app.use('/api/ia', auth, rate({ windowMs: 60 * 1000, max: 10 }), require('./routes/ia'));
app.use('/api/jobs', require('./routes/jobs'));
const webDir = [path.join(__dirname, '../../academia-baile-web/dist'), path.join(__dirname, '../../academia-baile-web')].find(d => fs.existsSync(path.join(d, 'index.html')));
if (webDir) app.use(express.static(webDir));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Error interno' }); });
module.exports = app;
if (!process.env.VERCEL && require.main === module) {
  app.listen(process.env.PORT || 3000, () => { console.log('http://localhost:' + (process.env.PORT || 3000)); require('./jobs/estados')(); });
}
