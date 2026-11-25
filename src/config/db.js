require('dotenv').config();

// Orden de prioridad: DB_* (local/otro host) → TIDB_* (Marketplace) → DATABASE_URL.
const primero = (...claves) => {
  for (const clave of claves) {
    const valor = process.env[clave];
    if (valor !== undefined && valor !== '') return valor;
  }
  return undefined;
};

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const hostDB = primero('DB_HOST');
const host = hostDB || primero('TIDB_HOST') || (url && url.hostname);
const user = primero('DB_USER', 'TIDB_USER') || (url && decodeURIComponent(url.username));
const password = primero('DB_PASSWORD', 'TIDB_PASSWORD') ?? (url ? decodeURIComponent(url.password) : undefined);
const database = primero('DB_NAME', 'TIDB_DATABASE') || (url && decodeURIComponent(url.pathname.replace(/^\//, '')));
const port = Number(primero('DB_PORT', 'TIDB_PORT') || (url && url.port) || 3306);

// TiDB Cloud exige TLS. Si no se configuró DB_SSL explícitamente, se activa solo al detectarlo.
const esTiDB = (!hostDB && Boolean(process.env.TIDB_HOST)) || /tidbcloud/i.test(host || '') || /tidbcloud/i.test(process.env.DATABASE_URL || '');
const usarSSL = process.env.DB_SSL === undefined ? esTiDB : process.env.DB_SSL === 'true';
const ssl = usarSSL ? { ca: process.env.DB_SSL_CA || undefined } : undefined;
const connectionLimit = Number(process.env.DB_POOL_LIMIT) || (process.env.VERCEL ? 2 : 10);

module.exports = require('mysql2/promise').createPool({
  host, port, user, password, database,
  waitForConnections: true,
  connectionLimit,
  dateStrings: true,
  ssl
});
