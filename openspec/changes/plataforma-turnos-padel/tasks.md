## 1. Setup del monorepo y base

- [x] 1.1 Crear estructura `server/` (Express + TypeScript + ESLint) y `web/` (React + Vite + TypeScript) con scripts `dev/build/lint`; verificar que `npm install` y `npm run lint` corren sin errores en ambas
- [x] 1.2 Levantar API mínima en `server` con endpoint `GET /api/health`; verificar con petición HTTP que responde 200
- [x] 1.3 Levantar SPA base en `web` con React Router y proxy de `/api` hacia el servidor; verificar que una página de prueba carga y la llamada a `/api/health` responde
- [x] 1.4 Configurar PostgreSQL local y Prisma; verificar que `npx prisma migrate dev` aplica la migración inicial sobre una BD vacía

## 2. Modelo de datos, migraciones y seed

- [x] 2.1 Definir esquema Prisma con: `User` (roles Jugador/Dueño/Profesor), `Complex`, `Court`, `TemplateCell` (día/hora/precio/disponibilidad), `Turn` (fecha/estado/precio), `Reservation` (tipo, payment info), `Payment` (payable_type/payable_id, monto, estado pagado/pendiente), `ProfessorRequest`, `ProfessorComplex`, `Student`; verificar `npx prisma validate` sin errores
- [x] 2.2 Agregar índice único `Reservation.turn_id` y restricción única `(court_id, date, start_time)` en `Turn`; verificar que `prisma migrate dev` genera la migración y la aplica
- [x] 2.3 Escribir script `seed`: usuario Dueño, Profesor, Jugador, un complejo demo con canchas, un grid semanal de ejemplo y turnos generados; verificar que `npx prisma db seed` corre sin errores y los registros quedan en la BD

## 3. identity — autenticación, roles y vinculaciones

- [x] 3.1 Implementar `POST /api/auth/register` con validación, email único y hash bcrypt de la contraseña; verificar que registrar un email duplicado devuelve 409 y que la contraseña no se persiste en claro
- [x] 3.2 Implementar `POST /api/auth/login`, `POST /api/auth/logout` y `GET /api/auth/me` con JWT en cookie httpOnly; verificar flujo completo de login → me → logout en cliente HTTP
- [x] 3.3 Implementar middleware `requireRole` y helpers de pertenencia (Dueño de complejo, Profesor aprobado en complejo); verificar con tests de integración que un rol no autorizado recibe 403
- [x] 3.4 Implementar edición de perfil (`PUT /api/auth/me`); verificar que actualizar nombre/teléfono persiste y mantener email único se valida
- [x] 3.5 Implementar solicitudes de profesor: `POST /api/professors/requests`, listado y aprobación/rechazo por el Dueño (`PUT /api/complexes/:id/professor-requests`); verificar que tras aprobar aparece el `ProfessorComplex` y que el profesor no opera en complejos no aprobados

## 4. complexes — catálogo y página pública

- [x] 4.1 Implementar `GET /api/complexes` (con filtros por nombre y ubicación) y `GET /api/complexes/search`; verificar con tests de API que el filtrado devuelve solo coincidencias
- [x] 4.2 Construir el inicio de la app con tarjetas de complejos (nombre, ubicación, descripción, cantidad de canchas, rango de precios) navegables; verificar visualmente seleccionando un complejo
- [x] 4.3 Implementar creación de complejo por Dueño (`POST /api/complexes`) y su vínculo como administrador; verificar que el Dueño sin complejo ve la invitación a crearlo y que el nuevo complejo aparece en el catálogo
- [x] 4.4 Implementar edición de información por el Dueño administrador (`PUT /api/complexes/:id`) con verificación de propiedad; verificar que otro Dueño recibe 403
- [x] 4.5 Implementar página pública `/complexes/:id` con datos del complejo y manejo de 404; verificar que una URL inexistente muestra "complejo no encontrado"
- [x] 4.6 Mostrar en la página del complejo el calendario de turnos consumiendo el endpoint público de turnos (tareas de 5.x/6.x); verificar que se pintan turnos con estado y precio

## 5. schedules — "excel de canchas" y generación de turnos

- [x] 5.1 Implementar `GET /api/complexes/:id/schedule` devolviendo el grid semanal (filas cancha, columnas día/hora, estado y precio), solo para el Dueño administrador; verificar salida JSON esperada
- [x] 5.2 Implementar persistencia del grid vía `PUT /api/complexes/:id/schedule` (alta/baja de `Court` y upsert de `TemplateCell`); verificar que tras guardar el grid recuperado coincide
- [x] 5.3 Construir componente React de grid reutilizable (columnas día/hora, filas canchas) con modo lectura y modo edición; verificar que en modo Dueño permite marcar disponible/bloqueado y editar precio por celda, y que hay botón "guardar"
- [x] 5.4 Implementar alta/baja de canchas en el grid con confirmación cuando existen reservas futuras; verificar que quitar una cancha sin reservas elimina sus celdas y turnos futuros sin choques
- [x] 5.5 Implementar generación de turnos desde el template (`ensureTurnsForRange` para horizonte móvil) y el estado derivado de cada turno según template + reserva; verificar que una celda disponible genera turnos AVAILABLE y una bloqueada genera BLOCKED
- [x] 5.6 Implementar validación de conflictos al guardar: bloquear/eliminar celdas con turnos futuros reservados exige decidir (conservar o cancelar); verificar que sin resolver el guardado se rechaza con mensaje claro
- [x] 5.7 Verificar que tras guardar el grid, `GET` público de turnos refleja de inmediato disponibilidad/precio/bloqueos sin pisar turnos OCCUPIED
- [x] 5.8 Implementar exportación/importación opcional `.xlsx` del grid (bajo flag) con SheetJS respetando la estructura fila/cancha - columna/turno; verificar export → import idempotente y rechazo de formato inválido

## 6. reservations — calendario público y reservas

- [x] 6.1 Implementar `GET /api/complexes/:id/turns?from&to` público (genera turnos bajo demanda si faltan) con estado y precio; verificar que devuelve solo el rango pedido
- [x] 6.2 Construir en la página pública la vista de turnos por fechas mostrando disponible/ocupado/bloqueado; verificar que los turnos ocupados y bloqueados no ofrecen acción de reserva
- [x] 6.3 Implementar modal de reserva (nombre, contacto; opcional jugador autenticado) que crea `Post /api/turns/:id/reservations`; verificar que al confirmar el turno pasa a OCCUPIED y se muestra la confirmación
- [x] 6.4 Implementar prevención de doble reserva (transacción + índice único) devolviendo 409 y refrescando el calendario; verificar con dos reservas concurrentes que solo una gana
- [x] 6.5 Implementar cancelación por jugador y por Dueño (`DELETE /api/reservations/:id`); verificar que el turno vuelve a AVAILABLE
- [x] 6.6 Implementar cobros de turnos para el Dueño: listar reservas del complejo, registrar monto y estado pagado/pendiente, y total cobrado; verificar que marcar como pagada actualiza el estado y el total
- [x] 6.7 Implementar "Mis reservas" para jugador autenticado (incluye reservas de invitado vinculadas); verificar que la lista muestra complejo, turno, estado y pago

## 7. classes — profesor, alumnos y cobros

- [x] 7.1 Implementar reserva de clase para Profesor aprobado (`POST /api/turns/:id/reservations` con tipo CLASS y profesor); verificar que un profesor sin vínculo aprobado recibe 403
- [x] 7.2 Implementar CRUD de alumnos del profesor (`/api/professors/students`); verificar alta/baja y que al quitar un alumno se conserva su historial de cobros
- [x] 7.3 Implementar registro de cobros de clase (`POST /api/professors/payments`) y saldo pendiente por alumno; verificar que el saldo cuadra con los cobros pendientes
- [x] 7.4 Implementar historial del profesor (reservas de clase pasadas/futuras y cobros por periodo); verificar que los datos mostrados coinciden con lo registrado

## 8. Integración, verificación y cierre

- [x] 8.1 Ejecutar flujo E2E en dev: Dueño registra complejo → carga grid → jugador reserva un turno → Dueño cobra → Profesor solicita y reserva una clase; verificar cada paso en el navegador contra el seed
- [x] 8.2 Correr `npm run lint` y `npm run build` en `server` y `web`; verificar cero errores
- [x] 8.3 Correr `openspec validate plataforma-turnos-padel`; verificar que el change valida sin errores antes de archivar