## Context

Proyecto greenfield ("TuTurnito"): el repo solo contiene README y la base openspec. No hay código, specs previas ni decisiones técnicas tomadas. La motivación y el alcance están en proposal.md y el detalle de comportamiento en los specs (`identity`, `complexes`, `schedules`, `reservations`, `classes`). Requisitos confirmados con el usuario: el "excel de canchas" es un grid editable web perseguido en BD (el .xlsx es opcional) y las reservas son libres con cobro manual (sin pasarela de pagos).

## Goals / Non-Goals

**Goals:**
- Arquitectura full-stack simple de dos partes: API REST (Node) y frontend React, con modelo de datos relacional.
- Un único modelo de "turno" que cubra el grid del Dueño (editable, fuente de verdad) y el calendario público (solo lectura), evitando duplicar lógica.
- Reserva libre sin pasarela de pagos, con cobro manual por Dueño y por Profesor.
- Control de acceso por rol con verificaciones de pertenencia (Dueño → su complejo; Profesor → complejos aprobados).
- Extensibilidad: el .xlsx queda como característica opcional detrás de la misma estructura de datos del grid.

**Non-Goals:**
- Pasarela de pagos, facturación y comprobantes electrónicos.
- Notificaciones en tiempo real (push/sockets), chat ni reseñas.
- Apps móviles nativas; la web debe ser responsive.
- i18n/multi-idioma.
- Poda de turnos históricos (retención mínima: se conservan para historial).

## Decisions

### D1. Stack base: Express + React (Vite) + PostgreSQL + Prisma
- Backend **Node.js + Express** (API REST), frontend **React + Vite + TypeScript**, ORM **Prisma** sobre **PostgreSQL**.
- Por qué: Express es el estándar con más documentación (curva baja para el equipo); TypeScript en ambos lados reduce errores de contrato; Prisma da migraciones y tipado sin escribir SQL a mano; PostgreSQL es el motor relacional de referencia para el modelo (complejos, turnos, cobros). 
- Alternativas: NestJS (más estructura pero más complejo), Fastify (más rápido pero menos ejemplos), MongoDB/Mongoose (documentos; el modelo es fuertemente relacional y con restricciones de concurrencia, no encaja), autorización tipo Rails (no aplica).
- Trade-off asumido: dev local exige PostgreSQL; se puede conmutar a SQLite solo para pruebas cambiando la cadena de conexión de Prisma (los tipos usados son compatibles).

### D2. Autenticación JWT con token en cookie httpOnly
- Login emite un JWT firmado; el token viaja en cookie `httpOnly` (y `secure` en producción). Middleware resuelve `req.user` y permite `requireRole('DUEÑO' | 'PROFESOR' | 'JUGADOR')` + helpers de pertenencia.
- Por qué: cookie httpOnly evita robo vía XSS comparado con localStorage; middleware por rol es extensible. Alternativa considerada: `Authorization: Bearer` + localStorage (más simple pero menos seguro).
- Contraseñas con **bcrypt** (hash + salt). Email único como identidad.

### D3. Modelo de turnos: template semanal + ocurrencias materializadas
Todo gira alrededor de dos entidades conectadas:

- **`TemplateCell`** (el "excel de canchas"): `(court_id, day_of_week, start_time, end_time, price, availability)` con `availability ∈ {AVAILABLE, BLOCKED}`. Es la fuente de verdad que edita el Dueño y lo que guarda/exporta el grid.
- **`Turn`**: ocurrencia concreta `(court_id, date, start_time, end_time, price, state)` con `state ∈ {AVAILABLE, OCCUPIED, BLOCKED}`. Se genera desde `TemplateCell` para un horizonte de fechas (ej. próximos 90 días, ampliable bajo demanda por `ensureTurnsForRange(complexId, from, to)`).

Reglas de estado derivadas:
- `OCCUPIED`: existe `Reservation` 1:1 sobre el turno. Se previene doble reserva con un **índice único** `(turn_id)` en `Reservation` y una transacción que lee/crea atómicamente el turno ocupado.
- `BLOCKED`: el turno se bloquea porque su `TemplateCell` quedó bloqueada o el Dueño lo bloqueó explícitamente.
- Guardar el grid recalcula los turnos futuros afectados de forma idempotente: crea los ausentes, marca los futuros sin reserva según el nuevo estado/precio y **nunca** pisa un turno con reserva. Un cambio que bloquee una celda con reservas futuras se rechaza hasta que el Dueño resuelva (cancelar o conservar) — ver spec `schedules`.

- Por qué esta forma: mantiene el calendario público real (fechas concretas) con restricciones de concurrencia fuertes sobre filas materializadas, y conserva el grid como la fuente editable sin duplicar estado. Alternativas: generar el calendario "en vuelo" desde el template + reservas (menos duplicación pero reservas sin fila que fijar para el lock) o materializar infinitos turnos (imposible). El horizonte móvil + generación bajo demanda evita crecimiento descontrolado; una tarea programada (cron simple o generación lazy al consultar) extiende el horizonte.

### D4. El "Excel de canchas": un mismo componente de grid, dos modos
- Un **único componente de grid** en React: columnas = (día, hora inicio), filas = canchas, celda = estado + precio.
  - Modo Dueño: celdas editables (toggle disponible/bloqueado, precio click-to-edit, agregar/quitar cancha) con guardado explícito y detección de conflictos por reservas futuras.
  - Modo público: mismo grid en solo lectura dentro de la página del complejo (los turnos se pintan desde `Turn` para las fechas elegidas).
- Por qué: un solo componente de tabla editable/re-only evita dos implementaciones divergentes y es lo más cercano a la metáfora "planilla de Excel" pedida. Alternativa evaluada: librerías tipo Handsontable (potente pero con licencias/soporte limitado) → se descartan por simplicidad y control.
- El .xlsx opcional (SheetJS) lee/escribe exactamente la misma tabla que el grid (filas cancha / columnas turno), por lo que no agrega modelo.

### D5. Calendario público y reserva
- Página de complejo: vista por fechas con el grid semanal en modo lectura (o listado de turnos por día) mostrando precio y estado. Seleccionar un turno `AVAILABLE` abre un **modal de reserva** (nombre + contacto; opcionalmente usuario logueado). Confirmar → POST reserva; el turno pasa a `OCCUPIED`; error controlado si otro lo tomó (reventar el 409 y mostrar el turno ocupado).
- Reserva tiene: `type ∈ {PLAYER, CLASS}`, estado de pago y monto (cobro manual). Las reservas tipo `CLASS` se vinculan a un Profesor aprobado (ver `classes`).

### D6. Cobros y clases
- **`Payment`** unificado: `(payable_type, payable_id, amount, status ∈ {PAID, PENDING}, date, recorded_by)` donde `payable` es una `Reservation` (cobro de turno, lo registra el Dueño) o un `Student` (cobro de clase, lo registra el Profesor). Saldo pendiente = suma de `PENDING` de un alumno; total cobrado del complejo = suma de `PAID` sobre reservas del complejo.
- **Vínculo Profesor–complejo**: `ProfessorRequest` (profesor, complejo, estado pendiente/aprobado/rechazado); al aprobar se crea `ProfessorComplex`. Todas las operaciones de Profesor verifican este vínculo.
- **Alumnos**: `Student` (dueño profesor, nombre, contacto) y cobros por alumno. La reserva `CLASS` referencia opcionalmente alumnos (asistencia) pero el registro de cobros no depende de ello.

### D7. Estructura del repo y API
```
TuTurnito/
  server/   # Express + TypeScript + Prisma
    prisma/schema.prisma, src/{routes,services,middleware,lib}
  web/      # React + Vite + TypeScript
    src/{pages,components,api,store}
```
Endpoints principales (REST):
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/complexes` (catálogo con filtros), `GET /api/complexes/:id`, `POST/PUT /api/complexes` (Dueño)
- `GET /api/complexes/:id/schedule` (grid), `PUT /api/complexes/:id/schedule` (guardar grid, Dueño)
- `GET /api/complexes/:id/turns?from&to` (calendario público), `POST /api/turns/:id/reservations`, `DELETE /api/reservations/:id` (cancelar)
- `GET/PUT /api/complexes/:id/reservations` (listar, marcar cobro, cancelar — Dueño)
- `POST /api/professors/requests`, `GET/PUT /api/complexes/:id/professor-requests` (aprobación — Dueño)
- `GET/POST/DELETE /api/professors/students`, `GET/POST /api/professors/payments`, `GET /api/professors/history`

### D8. Gestión de fechas y hora
- Los horarios de juego son por complejo y se tratan en su **zona horaria local**; el complejo declara `timezone`. `start_time/end_time` se guardan como hora local del complejo y `date` como fecha local, evitando conversiones ambiguas en el modelo de turnos. El servidor usa UTC internamente solo para las marcas de auditoría (creado/actualizado).

## Risks / Trade-offs

- **Doble reserva concurrente** → índice único sobre `Reservation.turn_id` + transacción atómica de creación; al segundo usuario se le devuelve 409 y el turno se muestra ocupado. (spec `reservations`)
- **Horizonte de turnos**: materializar futuro acotado puede "abrir" tarde; generación lazy `ensureTurnsForRange` al consultar + tarea periódica para extender cubre el vacío y limita el crecimiento.
- **Complejidad del grid editable web** → reutilización del componente de grid y template uniforme (misma grilla semanal para todas las canchas); si la UX de celdas se vuelve pesada, el guardado explícito + validación da lugar a iterar sin rediseñar el modelo.
- **SheetJS y licencias / paquete npm** → la exportación/importación queda *opcional* y detrás de un flag; si se complica el empaquetado, se excluye sin tocar specs ni modelo.
- **Zonas horarias** → al tratar fechas como local del complejo se evita el desfase día/hora; riesgo residual de complejos que atraviesan husos (no aplica en un país con zona horaria única); se documenta en el seed.
- **Modelo unificado de Payment con polimorfismo** → leve complejidad de consulta; mitigado con tipos discriminados y consultas por `payable_type`.

## Migration Plan

- Greenfield: no hay datos que migrar. Orden de despliegue: 1) `prisma migrate dev` para crear esquema; 2) script `seed` con complejo demo, dueño, profesor, grid semanal de ejemplo y turnos (usado por E2E y demo); 3) `server` y `web` se corren juntos en dev (proxy Vite → Express). Rollback: por ser v0, revertir git y volver a ejecutar migraciones; las migraciones son incrementales desde el principio para futuros cambios.

## Open Questions

Ninguna que cambie specs, enfoque o desglose de tareas. El stack de UI (componentes) y el horizonte exacto de turnos son decisiones iterables durante la implementación.