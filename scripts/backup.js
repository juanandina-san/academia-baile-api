require('dotenv').config(); const { execFileSync } = require('child_process'), fs = require('fs');
fs.mkdirSync('backups', { recursive: true });
const f = `backups/${process.env.DB_NAME}_${new Date().toISOString().slice(0, 10)}.sql`;
fs.writeFileSync(f, execFileSync('mysqldump', ['-h', process.env.DB_HOST, '-u', process.env.DB_USER, `-p${process.env.DB_PASSWORD}`, process.env.DB_NAME]));
console.log('Backup guardado en ' + f);
