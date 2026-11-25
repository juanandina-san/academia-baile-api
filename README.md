# Academia de Baile — API

API REST en Node.js + Express para la gestión de la academia: alumnos, profesores, clases, inscripciones, cuotas y pagos, tablero de métricas y un asistente de IA de solo lectura.

El frontend (SPA vanilla) vive en [`../academia-baile-web`](../academia-baile-web) y esta API lo sirve como estático en local, por lo que la aplicación completa se abre en `http://localhost:3000`. En producción el frontend se despliega en Vercel o Netlify y apunta a esta API por HTTPS. La API corre en Vercel con una base TiDB Cloud Starter (MySQL compatible, gratuita), instalable desde el Marketplace de Vercel: ver [guía de despliegue de la API](DEPLOY.md) y [del frontend](../academia-baile-web/DEPLOY.md).

## Stack

| Componente | Detalle |
| :--- | :--- |
| Runtime | Node.js 18+ · Express 4 (CommonJS) |
| Base de datos | MySQL 8 vía `mysql2/promise` (pool) |
| Auth | JWT (8 h) + `bcrypt` |
| Seguridad | `helmet`, `cors`, `express-rate-limit` |
| Tareas programadas | `node-cron` (job diario 03:00) |
| IA | API de Anthropic con *tool use* de solo lectura |

## Requisitos

- Node.js 18 o superior.
- MySQL 8 en ejecución.
- `mysqldump` en el `PATH` solo si se van a generar backups.

## Puesta en marcha

```bash
# 1. Crear la base de datos y las tablas
mysql -u root -p < database/schema.sql

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
#    Copiar .env.example a .env y completar los valores
cp .env.example .env

# 4. Crear el usuario administrador
npm run admin -- "Tu Nombre" tu@email.com TuClaveSegura

# 5. Levantar el servidor
npm run dev
```

Abrir `http://localhost:3000`. El cron de cuotas y estados se ejecuta al iniciar el servidor.

## Variables de entorno

| Variable | Descripción |
| :--- | :--- |
| `PORT` | Puerto del servidor (por defecto `3000`). |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión MySQL para local u host propio. Tienen prioridad sobre `TIDB_*`. |
| `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE` | Inyectadas por la integración TiDB Cloud del Marketplace de Vercel. |
| `DATABASE_URL` | Alternativa en formato URL (`mysql://usuario:clave@host:puerto/base`); tercera opción. |
| `DB_SSL` / `DB_SSL_CA` | TLS de MySQL. Se activa automáticamente al detectar TiDB; `DB_SSL` lo fuerza. |
| `DB_POOL_LIMIT` | Conexiones por instancia: 2 por defecto en Vercel, 10 en local. |
| `JWT_SECRET` | Texto largo usado para firmar los tokens. |
| `ANTHROPIC_API_KEY` | Clave de la API de Anthropic para el asistente. |
| `IA_MODEL` | Modelo de IA a utilizar. |
| `CORS_ORIGIN` | Orígenes permitidos separados por comas. Vacío = todos (solo local). |
| `CRON_SECRET` | Secreto para `GET` (Vercel Cron) y `POST /api/jobs/estados`. |

> `src/config/db.js` resuelve la conexión en este orden: `DB_*` → `TIDB_*` → `DATABASE_URL`. Con la integración del Marketplace no hay que copiar las variables a `DB_*`.

> `.env` contiene secretos y está excluido por `.gitignore`. Versionar únicamente `.env.example`.

## Scripts

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Servidor con recarga automática (`node --watch`). |
| `npm start` | Servidor en modo normal. |
| `npm run admin -- "Nombre" email clave` | Crea un usuario administrador. |
| `npm run backup` | Exporta la base a `backups/` con `mysqldump`. |

## Estructura

```
academia-baile-api/
├── src/
│   ├── app.js                 # bootstrap: middlewares, rutas, estáticos, error handler
│   ├── config/db.js           # pool de MySQL
│   ├── middlewares/auth.js    # auth (JWT) y soloAdmin
│   ├── routes/                # auth, alumnos, profesores, clases, pagos, dashboard, ia
│   ├── services/              # pagos.service.js (cuotas/estados), ia.service.js (herramientas IA)
│   └── jobs/estados.js        # cron: genera cuotas y actualiza estados
├── scripts/                   # crearAdmin.js, backup.js
├── database/schema.sql        # esquema completo + configuración inicial
├── .env.example               # plantilla de variables de entorno
└── AGENTS.md                  # guía del agente backend y contrato completo de la API
```

## API

Todas las rutas cuelgan de `/api`. Las protegidas requieren `Authorization: Bearer <token>`; sin token o con token inválido responden **401**.

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| POST | `/api/auth/login` | Login; devuelve `{ token, nombre, rol }`. |
| GET | `/api/dashboard` | KPIs, próximas clases, ingresos y alumnos por clase. |
| GET/POST/PUT/DELETE | `/api/alumnos` | Padrón de alumnos, ficha e historial. |
| GET/POST/PUT/DELETE | `/api/profesores` | CRUD de profesores con baja lógica. |
| GET/POST/PUT/DELETE | `/api/clases` | Clases, horarios, cupos e inscripciones. |
| GET/POST | `/api/pagos` | Cuotas, registro de pagos y reporte mensual. |
| POST | `/api/ia` | Consulta al asistente de IA (solo lectura). |
| GET/POST | `/api/jobs/estados` | Dispara cuotas/estados; GET con `Authorization: Bearer` (Vercel Cron) o POST con `x-cron-secret`. |

El contrato detallado (parámetros, validaciones y códigos de estado) está en [`AGENTS.md`](AGENTS.md).

### Errores

Siempre `{ "error": "<mensaje en español>" }`. Validaciones → `400`, no encontrado → `404`, conflicto → `409`, permisos → `403`, error interno → `500`.

## Reglas de negocio clave

- **Baja lógica** cuando hay historial: alumnos `estado='inactivo'`, clases `activa=0`, profesores `activo=0`.
- **Estados del alumno:** `activo`, `pendiente_pago`, `inactivo`, según cuotas vencidas y días de tolerancia.
- **Cuotas:** una por inscripción activa del mes, sin duplicados, con vencimiento según la configuración.
- **Cupos:** no se inscribe por encima de `cupo_maximo` ni se baja el cupo por debajo de los inscriptos activos.
- **Asistente IA:** solo ejecuta herramientas de lectura; cada consulta queda auditada en `consultas_ia`.

## Documentación

- [`AGENTS.md`](AGENTS.md): rol del agente backend, arquitectura y contrato completo de endpoints.
- [`../academia-baile-web/README.md`](../academia-baile-web/README.md): frontend, design system y convenciones.
- [`../../README.md`](../../README.md): puesta en marcha rápida del workspace.
- [`../../ESTADO_Y_PENDIENTES.md`](../../ESTADO_Y_PENDIENTES.md): estado del proyecto y hoja de ruta.
