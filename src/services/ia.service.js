// El asistente SOLO puede llamar a estas herramientas de lectura. No escribe SQL libre ni modifica datos.
const db = require('../config/db');
const q = async (sql, p = []) => (await db.execute(sql, p))[0];
const HERRAMIENTAS = {
  resumen_academia: { desc: 'Totales de alumnos por estado, clases e ingresos del mes', run: async () => ({
    alumnos: (await q(`SELECT COUNT(*) total, SUM(estado='activo') activos, SUM(estado='pendiente_pago') pendientes, SUM(estado='inactivo') inactivos FROM alumnos`))[0],
    ingresos_mes: (await q(`SELECT COALESCE(SUM(importe),0) total FROM pagos WHERE estado='pagado' AND DATE_FORMAT(fecha_pago,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')`))[0].total,
    clases: (await q(`SELECT COUNT(*) n FROM clases WHERE activa=1`))[0].n }) },
  alumnos_sin_pago_mes: { desc: 'Alumnos con cuota pendiente del mes actual', run: () => q(`SELECT a.nombre,a.apellido,a.dni,c.nombre clase,p.importe,p.fecha_vencimiento FROM pagos p JOIN inscripciones i ON i.id=p.inscripcion_id JOIN alumnos a ON a.id=i.alumno_id JOIN clases c ON c.id=i.clase_id WHERE p.estado='pendiente' AND DATE_FORMAT(p.periodo,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')`) },
  alumnos_proximos_inactivos: { desc: 'Alumnos con deuda vencida que están por quedar inactivos', run: () => q(`SELECT a.nombre,a.apellido,a.estado,MIN(p.fecha_vencimiento) deuda_desde,DATEDIFF(CURDATE(),MIN(p.fecha_vencimiento)) dias_atraso FROM pagos p JOIN inscripciones i ON i.id=p.inscripcion_id JOIN alumnos a ON a.id=i.alumno_id WHERE p.estado='pendiente' AND p.fecha_vencimiento<CURDATE() AND a.estado<>'inactivo' GROUP BY a.id ORDER BY dias_atraso DESC`) },
  clases_ranking: { desc: 'Clases ordenadas por cantidad de alumnos inscriptos y cupo', run: () => q(`SELECT c.nombre,c.cupo_maximo,COUNT(i.id) inscriptos FROM clases c LEFT JOIN inscripciones i ON i.clase_id=c.id AND i.estado='activa' WHERE c.activa=1 GROUP BY c.id ORDER BY inscriptos DESC`) },
  ingresos_por_mes: { desc: 'Ingresos y cantidad de pagos de los últimos 12 meses (crecimiento)', run: () => q(`SELECT DATE_FORMAT(fecha_pago,'%Y-%m') mes,SUM(importe) total,COUNT(*) pagos FROM pagos WHERE estado='pagado' GROUP BY mes ORDER BY mes DESC LIMIT 12`) },
  altas_por_mes: { desc: 'Alumnos nuevos por mes (crecimiento)', run: () => q(`SELECT DATE_FORMAT(fecha_inscripcion,'%Y-%m') mes,COUNT(*) altas FROM alumnos GROUP BY mes ORDER BY mes DESC LIMIT 12`) }
};
const tools = Object.entries(HERRAMIENTAS).map(([name, t]) => ({ name, description: t.desc, input_schema: { type: 'object', properties: {} } }));
const SYSTEM = 'Eres el asistente administrativo de una academia de baile. Responde en español, claro y breve. Usa SOLO datos obtenidos con las herramientas; si no los tienes, dilo. No inventes cifras. No puedes modificar datos. Puedes dar recomendaciones de gestión basadas en los datos.';
exports.preguntar = async (pregunta) => {
  const messages = [{ role: 'user', content: pregunta }];
  for (let i = 0; i < 5; i++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.IA_MODEL || 'claude-sonnet-5-5', max_tokens: 1000, system: SYSTEM, tools, messages }) });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'Error de IA');
    if (data.stop_reason !== 'tool_use') return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    messages.push({ role: 'assistant', content: data.content });
    const results = [];
    for (const b of data.content.filter(b => b.type === 'tool_use'))
      results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(await HERRAMIENTAS[b.name].run()) });
    messages.push({ role: 'user', content: results });
  }
  return 'No pude completar la consulta.';
};
