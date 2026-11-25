# AGENTS.md — Backend (Academia de Baile)

Guía de trabajo para agentes que toquen el backend. Describe el rol esperado, la arquitectura real del código y las reglas que **no** se deben romper.

## Rol: Backend Developer (`backend-dev`)

Responsable de la API REST, la integridad de datos, la seguridad y las reglas de negocio de la academia. No modifica la UI; expone contratos estables que consume `E:\meto\repos\academia-baile-web`.

### Reglas de trabajo

- **Cambios mínimos y quirúrgicos.** El backend ya funciona; no refactorizar por gusto ni cambiar nombres de rutas, campos de respuesta o códigos de estado sin actualizar el frontend en el mismo cambio.
- **Todo cambio de esquema va en `database/schema.sql`** (más script de migración si la base ya tiene datos). Nunca borrar columnas o tablas con historial.
- **Nunca commitear `.env`.** Contiene credenciales de MySQL y `ANTHROPIC_API_KEY`. Usar `.env.example` como plantilla.
- **SQL siempre parametrizado** (`db.execute(sql, params)`). Prohibido interpolar input del usuario en el SQL.
- **Probar el endpoint** con `curl` o el cliente HTTP antes de darlo por terminado (login, 200/201, 400 de validación y 401 sin token).

---

## Stack y estructura

| Componente | Detalle |
| :--- | :--- |
| Runtime | Node.js + Express 4 (CommonJS, `require`) |
| Base de datos | MySQL 8 vía `mysql2/promise` con pool (`connectionLimit`: 10 local / 2 en Vercel, `dateStrings: true`); acepta `DB_*`, `TIDB_*` o `DATABASE_URL` |
| Auth | JWT (`jsonwebtoken`) 8 h + `bcrypt` para hashing |
| Seguridad | `helmet` (CSP deshabilitado), `cors`, `express-rate-limit` |
| Tareas programadas | `node-cron` (job diario 03:00) |
| IA | API de Anthropic con *tool use* de solo lectura |
| Assets | Express sirve `../../academia-baile-web` como estático |

```
academia-baile-api/
├── src/app.js                 # bootstrap: middlewares, montaje de rutas, estáticos, error handler
├── src/config/db.js           # pool mysql2 (usa DB_* de .env)
├── src/middlewares/auth.js    # auth (JWT) y soloAdmin (rol === 'admin')
├── src/routes/                # auth, alumnos, profesores, clases, pagos, dashboard, ia
├── src/services/              # pagos.service.js (cuotas/estados), ia.service.js (herramientas IA)
├── src/jobs/estados.js        # cron: genera cuotas y actualiza estados
├── scripts/crearAdmin.js      # npm run admin -- "Nombre" email clave
├── scripts/backup.js          # npm run backup (requiere mysqldump en PATH)
├── database/schema.sql        # esquema completo + configuración inicial
└── .env.example               # PORT, DB_*, JWT_SECRET, ANTHROPIC_API_KEY, IA_MODEL
```

### Scripts npm

```bash
npm install
npm run dev       # node --watch src/app.js  → http://localhost:3000
npm start
npm run admin -- "Tu Nombre" tu@email.com TuClaveSegura
npm run backup
```

---

## Contrato de la API

Todas las rutas cuelgan de `/api`. Las protegidas requieren `Authorization: Bearer <token>`; sin token o token inválido devuelven **401** (el frontend hace logout automático).

| Método | Ruta | Auth | Notas |
| :--- | :--- | :--- | :--- |
| POST | `/api/auth/login` | público (rate limit 20/15 min) | devuelve `{ token, nombre, rol }` |
| GET | `/api/dashboard` | JWT | KPIs, próximas clases, ingresos (6 meses), alumnos por clase |
| GET | `/api/alumnos?q=&estado=` | JWT | búsqueda por nombre/apellido/DNI y filtro de estado |
| GET | `/api/alumnos/:id` | JWT | ficha con inscripciones y pagos |
| POST | `/api/alumnos` | JWT | valida nombre, apellido, DNI (6–10 dígitos), email |
| PUT | `/api/alumnos/:id` | JWT | permite cambiar `estado` (`activo`, `pendiente_pago`, `inactivo`) |
| DELETE | `/api/alumnos/:id` | admin | **baja lógica** (conserva historial) |
| DELETE | `/api/alumnos/:id/definitivo` | admin | solo si no tiene inscripciones |
| GET | `/api/profesores?q=&estado=` | JWT | `estado` = `activos` (default), `inactivos` o `todos`; incluye `clases` activas y `alumnos` a cargo |
| GET | `/api/profesores/:id` | JWT | ficha con las clases a cargo |
| POST | `/api/profesores` | admin | valida nombre, apellido y email |
| PUT | `/api/profesores/:id` | admin | edita datos y `activo`; rechaza baja con clases activas |
| DELETE | `/api/profesores/:id` | admin | **baja lógica** (`activo=0`); rechaza si tiene clases activas |
| DELETE | `/api/profesores/:id/definitivo` | admin | solo si nunca tuvo clases |
| GET | `/api/clases` | JWT | incluye profesor, inscriptos, horarios y `horarios_lista` |
| GET | `/api/clases/profesores` | JWT | **alias** de `/api/profesores` (profesores activos) |
| POST | `/api/clases` | admin | alta con horarios |
| PUT | `/api/clases/:id` | admin | un único horario; cupo ≥ inscriptos |
| DELETE | `/api/clases/:id` | admin | baja lógica; rechaza si hay inscriptos activos |
| GET | `/api/clases/:id/alumnos` | JWT | inscriptos activos |
| POST | `/api/clases/:id/inscribir` | JWT | valida cupo; regenera cuotas |
| DELETE | `/api/clases/inscripciones/:id` | JWT | baja de inscripción |
| GET | `/api/pagos?estado=` | JWT | últimas 300 cuotas con alumno y clase |
| POST | `/api/pagos/:id/pagar` | JWT | `metodo_pago` ∈ `efectivo`, `transferencia`, `tarjeta`, `mercadopago`, `otro`; reactiva al alumno si saldó |
| GET | `/api/pagos/reporte` | JWT | últimos 12 meses |
| POST | `/api/ia` | JWT (rate limit 10/min) | `{ pregunta }` ≤ 500 caracteres |
| GET/POST | `/api/jobs/estados` | `Authorization: Bearer` o `x-cron-secret` | Vercel Cron (GET) o scheduler externo; 401 si `CRON_SECRET` no está configurado |

### Errores

Siempre `{ "error": "<mensaje en español>" }`. `express-async-errors` captura los `throw` y el handler final responde 500 `{ error: 'Error interno' }` logueando el stack. Validaciones → 400, no encontrado → 404, conflicto → 409, permisos → 403.

---

## Reglas de negocio críticas

- **Baja lógica, nunca física, si hay historial.** Alumnos: `estado='inactivo'` + `fecha_baja`, y sus inscripciones activas pasan a `baja`. Clases: `activa=0`. Profesores: `activo=0` (solo si no tienen clases activas).
- **Estados del alumno:** `activo`, `pendiente_pago`, `inactivo`. `pagos.service.actualizarEstados()` marca pendiente cuando hay cuota vencida e inactivo pasada la `dias_tolerancia` (config por defecto 15 días).
- **Cuotas:** `generarCuotas()` crea una cuota por inscripción activa del mes (`INSERT IGNORE`, así no duplica) con vencimiento según `dia_vencimiento` (config por defecto 10).
- **Cupos:** no inscribir por encima de `cupo_maximo`; no bajar el cupo por debajo de los inscriptos activos.
- **Configuración** en tabla `configuracion` (`clave`, `valor`): `dia_vencimiento`, `dias_tolerancia`.
- **Asistente IA:** solo puede ejecutar las herramientas de `HERRAMIENTAS` en `ia.service.js` (todas de lectura). No agregar SQL libre, escrituras ni acceso a datos sensibles. Cada consulta se audita en `consultas_ia`.
- **`dateStrings: true`** en el pool: las fechas llegan como `YYYY-MM-DD` / `HH:MM:SS` y así las consume el frontend. No cambiar sin coordinarlo.

---

## Checklist antes de entregar

- [ ] `npm run dev` arranca sin errores y el cron loguea "Cuotas y estados actualizados".
- [ ] Endpoint probado con y sin token (401), con payload inválido (400) y caso feliz.
- [ ] Ningún `console.log` de debug ni secreto en el código.
- [ ] Respuesta compatible con el frontend actual (mismos nombres de campos).
- [ ] Si tocaste `schema.sql`, documentaste la migración para bases existentes.

---

## Skills y herramientas

- **No hay skills de diseño aplicables acá.** El diseño UI/UX (`ui-ux-pro-max`, `design-system`, `ui-styling`, etc.) vive en el frontend.
- Skills disponibles en el workspace: `E:\meto\.agents\skills\`.
- MCP `ui-ux-pro` es solo para diseño: **no** usarlo para decisiones de backend.
- Para explorar/validar la API conviene `curl` o el panel de red del navegador; para revisar datos, MySQL directo con las credenciales de `.env`.

## Documentación del proyecto

- [README raíz](../../README.md): puesta en marcha completa.
- [ESTADO_Y_PENDIENTES.md](../../ESTADO_Y_PENDIENTES.md): estado del frontend y hoja de ruta.
- [AGENTS.md raíz](../../AGENTS.md): roles y skills del workspace.
