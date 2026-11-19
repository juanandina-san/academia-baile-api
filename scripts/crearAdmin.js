require('dotenv').config(); const db = require('../src/config/db'), bcrypt = require('bcrypt');
const [nombre, email, pass] = process.argv.slice(2);
if (!pass) { console.log('Uso: npm run admin -- "Nombre" email clave'); process.exit(1); }
(async () => { await db.execute(`INSERT INTO usuarios (nombre,email,password_hash,rol) VALUES (?,?,?,'admin')`, [nombre, email, await bcrypt.hash(pass, 12)]); console.log('Admin creado'); process.exit(); })();
