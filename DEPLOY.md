# Despliegue de la API en Vercel

## Base de datos recomendada (gratis): TiDB Cloud Starter

Es la mejor opción para este proyecto porque es **compatible con MySQL**: el `mysql2`, el esquema y las consultas actuales se usan sin reescribirlos.

- Plan **Starter**, MySQL-compatible: **$0/mes** con una asignación gratuita por instancia de **5 GiB de almacenamiento de filas, 5 GiB columnar y 50 millones de Request Units por mes** (hasta 5 instancias elegibles por organización; el total de la org es 25 GiB / 250 M RU). El consumo excedente se paga; conviene configurar un límite de gasto.
- Endpoint público con **TLS obligatorio** y conexiones desde cualquier IP, justo lo necesario porque las IPs de salida de Vercel son dinámicas.
- Alternativas descartadas: PlanetScale ya no tiene plan gratuito; Render/Neon/Supabase son Postgres (obligaría a migrar el SQL); Turso es SQLite/libSQL (también obligaría a migrar); hosts MySQL "gratis" sin SLA no son aptos para producción.

> Verificado en la documentación actual de Vercel: no existe un producto "Vercel MySQL" propio (`/docs/storage/mysql` devuelve 404). En cambio, **Marketplace Storage está disponible en todos los planes**, y entre sus integraciones figura **TiDB Cloud — "Built-In Vector Serverless MySQL"**. La página de la integración indica **hasta 5 clusters gratis**. Es una integración de terceros: se instala desde Vercel, pero el cluster se crea/gestiona en la consola de TiDB Cloud.

---

## Opción A (recomendada): instalar TiDB Cloud desde el Marketplace de Vercel

1. En el proyecto de la API, ir a **Integrations → Browse Marketplace → Storage → TiDB Cloud**. En la UI actual el botón se llama **Connect Account** (la documentación de TiDB todavía dice *Add Integration*); es el mismo paso. También se puede hacer con `vercel install tidb-cloud`.
2. Elegir el scope, seleccionar el proyecto de Vercel (`academia-api`), aceptar permisos y continuar a la consola de TiDB Cloud.
3. En la consola de TiDB: seleccionar organización/proyecto y **Connection type = Cluster**. El campo **Cluster** es un selector, no un input libre: si la lista está vacía, apretá **+ Create Cluster** y creá una instancia **Starter (MySQL compatible)**; recién después elegila. No escribas el nombre a mano, porque el formulario puede ocultar el resto de las opciones.
4. Después elegí/creá la base `academia_baile` y, en el campo separado **Framework**, seleccioná **General**. Es la opción correcta para Express + `mysql2`: la doc de TiDB indica que *General* se usa cuando el framework no está en la lista (las otras dos son Prisma y TiDB Cloud Serverless Driver). El branching para preview deployments es opcional; cerrar **Add Integration and Return to Vercel**.
5. La integración agrega al proyecto de Vercel:

   | Framework elegido | Variable inyectada | Uso |
   | :--- | :--- | :--- |
   | **General** | `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE` | Conexión directa con `mysql2`. **Es la que queremos.** |
   | Prisma / TiDB Cloud Serverless Driver | `DATABASE_URL` | Alternativas para esos frameworks; `src/config/db.js` también sabe leerla, pero no son necesarias acá. |

   **`src/config/db.js` ya las detecta**: activa TLS automáticamente y usa un pool de 2 conexiones en Vercel. No hace falta copiarlas a `DB_*`.

   La integración por Marketplace solo cubre instancias **Starter/Essential**. Para un cluster Dedicated o Premium hay que configurar las variables a mano (opción B).

6. Cargar el esquema (el archivo crea la base `academia_baile`):

```bash
mysql -h "$TIDB_HOST" -P "$TIDB_PORT" -u "$TIDB_USER" -p < database/schema.sql
```

   Si el usuario no puede crear bases, creala desde la consola (o durante el paso 4) y quitá las dos primeras líneas de `schema.sql`.

> Un proyecto de Vercel solo puede conectarse a un cluster TiDB Cloud a la vez. Para cambiarlo, desconectá la integración y conectá el nuevo cluster.

---

## Opción B: crear el cluster manualmente

1. Crear cuenta en `tidbcloud.com` y un cluster **Starter → MySQL Compatible** (elegí la región más cercana a tu función de Vercel).
2. En **Connect** elegí **Public**, generá la contraseña y copiá host, puerto (normalmente `4000`), usuario y nombre de base.
3. **Importante:** en el modelo de endpoint compartido el usuario lleva el prefijo de la cuenta entre comillas, p. ej. `"abc123.root"`. Copialo tal cual desde el diálogo de conexión.
4. Cargar el esquema con el mismo comando de la opción A.

En este caso sí configurá las variables `DB_*` que se indican abajo.

---

## API en Vercel

`src/app.js` exporta la app de Express (`module.exports = app`) y no levanta `app.listen` cuando corre en Vercel, así que Vercel la detecta y la ejecuta como una única Function (Fluid compute) sin build especial.

1. Importar `academia-baile-api` como proyecto nuevo en Vercel (Root Directory = raíz del repo).
2. Configurar **Environment Variables**:

| Variable | Valor de ejemplo | Observación |
| :--- | :--- | :--- |
| `TIDB_*` / `DATABASE_URL` | inyectadas por la integración | Opción A: no hace falta agregarlas a mano. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `gateway....tidbcloud.com`, `4000`, `"abc123.root"`, contraseña, `academia_baile` | Solo opción B/local. Tienen prioridad sobre `TIDB_*`. |
| `DB_SSL` | `true` | Opcional con TiDB: se activa solo si no se define esta variable. |
| `DB_SSL_CA` | vacío (CA del sistema) o el contenido del CA provisto por TiDB | Solo si querés fijar el CA. |
| `DB_POOL_LIMIT` | `2` | Por defecto es 2 en Vercel y 10 en local. |
| `JWT_SECRET` | texto largo y aleatorio | Firmas de los tokens. |
| `ANTHROPIC_API_KEY`, `IA_MODEL` | solo si usás el asistente IA | — |
| `CORS_ORIGIN` | `https://tu-web.vercel.app,https://tu-web.netlify.app` | Dominios exactos, sin barra final. Vacío = todos (solo local). |
| `CRON_SECRET` | texto largo y aleatorio | Vercel Cron y `POST /api/jobs/estados`. |

3. Deploy. Verificar:

```bash
curl -i https://TU-API.vercel.app/api/dashboard   # debe dar 401, no 404
```

4. Crear el administrador. Se puede hacer localmente apuntando a la misma DB con las mismas variables, o desde un entorno con acceso a la base:

```bash
npm run admin -- "Tu Nombre" tu@email.com TuClaveSegura
```

---

## Cron en Vercel

`node-cron` solo se registra cuando el servidor corre localmente (`npm start`). En Vercel lo reemplaza `vercel.json`:

```json
{ "crons": [{ "path": "/api/jobs/estados", "schedule": "0 3 * * *" }] }
```

Vercel llama por **GET** con `Authorization: Bearer <CRON_SECRET>`. El endpoint acepta ese formato y también `POST` con `x-cron-secret` para schedulers externos. La hora es **UTC**; si querés las 03:00 de Argentina (UTC-3), cambiá el schedule a `0 6 * * *`.

---

## Consideraciones serverless

- `express.static` queda inactivo en Vercel: el frontend se despliega aparte (ver `../academia-baile-web/DEPLOY.md`) y apunta a esta API con `API_URL`.
- El rate limit usa memoria por instancia: no es global como en un servidor único. Para un panel interno alcanza; si necesitás límites estrictos, habría que usar un store compartido.
- Las conexiones a MySQL se reutilizan mientras la instancia está caliente; por eso el pool por defecto es 2 en Vercel (`DB_POOL_LIMIT` lo override).
- `src/config/db.js` acepta `DB_*`, `TIDB_*` o `DATABASE_URL`, en ese orden de prioridad, y activa TLS automáticamente cuando detecta TiDB.
- Los secretos van siempre en variables de entorno de Vercel; nunca en el repo.
