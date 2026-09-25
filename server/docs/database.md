# Base de datos

## Estado actual

El backend corre sobre **PostgreSQL local** (no SQLite). Hay dos bases en la
instancia de Postgres de la máquina de desarrollo:

- `tuturnito_dev` — la base de uso diario (`npm run dev`, `npm run seed`).
- `tuturnito_test` — la que usa la suite automatizada (`npm test`), separada
  para que correr los tests nunca toque los datos de desarrollo.

El schema vive en [`prisma/schema.prisma`](../prisma/schema.prisma) y las
migraciones versionadas en `prisma/migrations/` (generadas con
`prisma migrate dev`, ya no con `db push` a mano). Los campos que antes eran
`String` con el enum documentado en un comentario (`role`, `state`,
`availability`, `type`, `status` de `Payment`, `status` de
`ProfessorRequest`, `payableType`) ahora son `enum` reales de Prisma:
`Role`, `TurnState`, `CellAvailability`, `ReservationType`, `PaymentStatus`,
`ProfessorRequestStatus`, `PayableType`.

Nota sobre `Role.DUEÑO`: el nombre del enum en el schema usa la `Ñ`
directamente (sin `@map`) a propósito — Prisma expone el valor tal cual al
cliente (`$Enums.Role.DUEÑO === 'DUEÑO'`), así que todas las comparaciones de
string ya existentes en rutas y frontend (`role === 'DUEÑO'`) siguen
funcionando sin cambios.

## Setup en una máquina nueva

1. Tener Postgres corriendo localmente (local o vía Docker, da igual).
2. Crear las dos bases:
   ```sql
   CREATE DATABASE tuturnito_dev;
   CREATE DATABASE tuturnito_test;
   ```
3. Copiar `.env.example` a `.env` y `.env.test` (ya versionado, no hace
   falta copiarlo) y completar `DATABASE_URL` con las credenciales reales.
4. `npm run prisma:migrate` (aplica las migraciones existentes) o
   `npx prisma migrate dev` si vas a crear una migración nueva.
5. `npm run seed` para cargar los datos de demo.

**Nota (repo con npm workspaces):** después de un `npm install` limpio en la
raíz, el cliente de Prisma a veces se genera vacío (el postinstall de
`@prisma/client` no siempre toma el schema de `server/` al hoistear a un
único `node_modules` raíz) — si TypeScript se queja de que
`@prisma/client` no exporta los modelos/enums, correr
`npm run prisma:generate` una vez desde la raíz lo soluciona.

## Lo que falta para producción (deferido a propósito)

Todavía no se eligió dónde se va a hostear la app, así que esto queda
pendiente hasta ese momento:

- Provisionar una instancia de Postgres en el proveedor elegido (o un
  contenedor si se decide Docker en vez de Postgres nativo).
- Apuntar el `DATABASE_URL` de producción a esa instancia y correr
  `prisma migrate deploy` (no `migrate dev`) para aplicar las migraciones
  existentes sin generar ninguna nueva.
- Connection pooling: algunos hosts (sobre todo los serverless) necesitan
  `?pgbouncer=true&connection_limit=1` en la URL o una `directUrl` separada
  para las migraciones. No se puede resolver hasta saber qué proveedor se
  usa — queda anotado acá para no tener que reinvestigarlo.
- Revisar `sameSite`/`secure` de la cookie de auth en
  [`auth.routes.ts`](../src/routes/auth.routes.ts) según si el frontend y la
  API terminan compartiendo origen en producción (ya hay un TODO en el
  código marcando esto).
