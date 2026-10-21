# Deploy gratis: Supabase + Render + Vercel

Orden: **base de datos → API → web → vincular → keep-alive**.

## 1. Supabase (base de datos)

1. New project. Elegí región cercana a la de Render (ej. East US si Render está en Ohio/Virginia) y guardá la contraseña de la base.
2. Botón **Connect** → **Session pooler** → copiá la URI (puerto `5432`, host `...pooler.supabase.com`).
   - Usá el *session pooler* y no la conexión directa: la directa es solo IPv6 y Render gratis no la alcanza.
   - Esa misma URL sirve para runtime y para `prisma migrate deploy`.
3. Reemplazá `[YOUR-PASSWORD]` por la contraseña. Si tiene caracteres raros (`@`, `/`, `#`), codificalos en URL.
4. Esta es tu `DATABASE_URL`.

Las tablas las crea Render al desplegar (migraciones). No hace falta tocar nada en Supabase.

## 2. Render (API)

1. Dashboard → **New → Blueprint** → conectá el repo `TuTurnito`. Lee `render.yaml`.
   - Si preferís a mano: *Web Service*, runtime Node, plan Free, y copiá build/start del `render.yaml`.
2. Cargá las variables que quedan en `sync: false`:
   - `DATABASE_URL`: la de Supabase.
   - `CLIENT_URL`: la URL de Vercel (paso 3). Al principio poné cualquiera y corregila después.
   - `TURNSTILE_SECRET`: tu secret de Cloudflare Turnstile (o dejalo vacío para desactivar el captcha).
3. `JWT_SECRET` se genera solo; `NODE_ENV=production` y `TRUST_PROXY=2` ya vienen del blueprint.
4. Primer deploy: el build corre las migraciones. Cuando termine, abrí `https://TU-API.onrender.com/api/health`. Debe devolver `{"status":"ok"...}`.
5. Crear el primer dueño (los dueños no se registran solos). Con la `DATABASE_URL` de Supabase en tu `server/.env` local:
   ```bash
   npm run create-owner --workspace=server -- --email dueno@mail.com --name "Nombre" --phone 2914567890
   ```
   Imprime una contraseña temporal. Los datos de ejemplo (`npm run seed`) no los cargues en producción.

## 3. Vercel (web)

1. **Add New → Project** → importá el repo.
2. **Root Directory: `web`**. Framework: Vite (lo detecta). Build `npm run build`, output `dist`.
3. Variables de entorno (las `VITE_*` se leen en el build):
   - `VITE_TURNSTILE_SITE_KEY`: site key de Turnstile (opcional).
   - `VITE_CONTACT_EMAIL`: email de contacto (opcional).
4. Antes de desplegar, editá `web/vercel.json` y cambiá `TU-API.onrender.com` por la URL real de Render. Commit y push.
   - Ese rewrite hace que el navegador hable solo con Vercel (`/api/...`). Las cookies de sesión quedan en el mismo origen y no hay CORS ni cookies de terceros.
5. Deploy. Copiá la URL de Vercel y ponela en `CLIENT_URL` de Render (se reinicia solo).

## 4. Keep-alive (GitHub Actions)

El workflow `.github/workflows/keepalive.yml` le pega a `/api/health` cada 10 min. Evita que Render se duerma y cuenta como actividad para Supabase.

1. Repo → Settings → Secrets and variables → Actions → **New repository secret**: `API_URL` = `https://TU-API.onrender.com` (sin barra final).
2. Pestaña Actions → *keepalive* → **Run workflow** para probarlo.

**Importante:** el repo es **privado** y los repos privados tienen 2000 min/mes gratis. Este workflow gasta ~4300 min/mes, así que se queda sin cupo. Dos salidas:
- Hacer el repo público (revisá antes que no haya secretos en el historial; `.env` está ignorado).
- Borrar el workflow y usar [cron-job.org](https://cron-job.org) (gratis): un job GET cada 10 min a `https://TU-API.onrender.com/api/health`.

## 5. Verificación

- [ ] `/api/health` responde ok.
- [ ] Entrás a la URL de Vercel, te registrás como jugador y la sesión persiste al recargar.
- [ ] Login del dueño con la contraseña temporal.
- [ ] Las rutas directas (ej. refrescar en una página interna) no dan 404.
- [ ] Rate limiting: `TRUST_PROXY=2` asume Vercel + Render delante. Si todos los usuarios se ven como la misma IP y se bloquean entre sí, probá con `1` o `3`.

## Limitaciones conocidas

- **Emails:** sin `SMTP_HOST` los recordatorios solo se imprimen en los logs de Render. Quedó fuera de esta etapa.
- **Cold start:** si el keep-alive falla, el primer request tarda ~30-50 s.
- **Horas de Render:** ~750 h/mes por cuenta. Un solo servicio 24/7 entra justo; no pongas otro servicio gratis en la misma cuenta.
- **Backups:** el plan gratis de Supabase no tiene backups descargables confiables. Si los datos importan, hacé `pg_dump` de vez en cuando.
