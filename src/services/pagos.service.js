const db = require('../config/db');
const cfg = async () => Object.fromEntries((await db.query('SELECT clave,valor FROM configuracion'))[0].map(r => [r.clave, +r.valor]));
exports.generarCuotas = async () => {
  const { dia_vencimiento } = await cfg();
  await db.execute(`INSERT IGNORE INTO pagos (inscripcion_id,periodo,importe,fecha_vencimiento)
    SELECT i.id, DATE_FORMAT(CURDATE(),'%Y-%m-01'), c.precio, DATE_ADD(DATE_FORMAT(CURDATE(),'%Y-%m-01'), INTERVAL ? DAY)
    FROM inscripciones i JOIN clases c ON c.id=i.clase_id JOIN alumnos a ON a.id=i.alumno_id
    WHERE i.estado='activa' AND a.estado<>'inactivo'`, [dia_vencimiento - 1]);
};
exports.actualizarEstados = async () => {
  const { dias_tolerancia } = await cfg();
  await db.execute(`UPDATE alumnos a SET estado='pendiente_pago' WHERE estado='activo' AND EXISTS
    (SELECT 1 FROM pagos p JOIN inscripciones i ON i.id=p.inscripcion_id WHERE i.alumno_id=a.id AND p.estado='pendiente' AND p.fecha_vencimiento<CURDATE())`);
  await db.execute(`UPDATE alumnos a SET estado='inactivo', fecha_baja=CURDATE() WHERE estado<>'inactivo' AND EXISTS
    (SELECT 1 FROM pagos p JOIN inscripciones i ON i.id=p.inscripcion_id WHERE i.alumno_id=a.id AND p.estado='pendiente'
     AND p.fecha_vencimiento < DATE_SUB(CURDATE(), INTERVAL ? DAY))`, [dias_tolerancia]);
};
