const cron = require('node-cron');
const s = require('../services/pagos.service');
const run = async () => { try { await s.generarCuotas(); await s.actualizarEstados(); console.log('Cuotas y estados actualizados'); } catch (e) { console.error(e); throw e; } };
const iniciar = () => { run().catch(console.error); cron.schedule('0 3 * * *', () => { run().catch(console.error); }); };
module.exports = iniciar;
module.exports.run = run;
