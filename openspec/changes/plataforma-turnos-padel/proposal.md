## Why

Sacar un turno de padel hoy es un proceso fragmentado: cada complejo maneja reservas por teléfono, WhatsApp o planillas propias. Queremos una plataforma web unificada donde cualquier jugador encuentre complejos, vea disponibilidad real en un calendario y reserve en el acto; y donde dueños y profesores administren canchas y clases desde un mismo lugar.

## What Changes

Proyecto **greenfield**: se construye desde cero la aplicación web "TuTurnito" (Node.js + React).

- **Catálogo público de complejos**: el inicio de la app lista todos los complejos de padel y permite seleccionar uno.
- **Página personalizada por complejo**: calendario con turnos disponibles/ocupados, precios e información del complejo.
- **Reserva de turnos**: al seleccionar un turno libre se abre un modal con el formulario de reserva. La reserva es libre (no exige pago online); el cobro se registra manualmente en el sistema, sin pasarela de pagos.
- **Tipos de usuario (roles)**: Jugador, Dueño de complejo y Profesor. Dueños y profesores son usuarios de la plataforma con sus propios paneles.
- **"Excel de canchas" del dueño**: un grid editable estilo planilla web (no archivo .xlsx) que configura canchas, turnos y precios por semana. Es la fuente de verdad que se traduce visualmente en el calendario público. Opcionalmente permite exportar/importar .xlsx.
- **Panel del profesor**: solicitar/unirse a un complejo, reservar canchas allí para sus clases, y administrar las personas de sus clases con registro de cobros.
- **Roles entre perfiles**: el dueño aprueba la solicitud del profesor y registra/confirma cobros de turnos en su complejo.

## Capabilities

### New Capabilities

- `identity`: registro, login y autenticación de usuarios; roles Jugador, Dueño y Profesor; perfiles y sesión.
- `complexes`: catálogo público de complejos de padel, su creación por parte del dueño y la página pública de cada complejo.
- `schedules`: "Excel de canchas" — grid semanal editable por el dueño que define canchas, turnos, precios y disponibilidad, y alimenta el calendario público.
- `reservations`: calendario de turnos (disponible/ocupado/bloqueado), reserva mediante formulario en modal y registro manual de cobros.
- `classes`: profesores vinculados a complejos, reservas de canchas para clases, administración de alumnos y registro de cobros de clases.

### Modified Capabilities

Ninguna. Es un proyecto greenfield; no existe capacidad previa que cambie.

## Impact

- **Código**: nueva aplicación monorepo/estructura con backend Node.js (API REST) y frontend React. No hay código existente que modificar.
- **Datos**: modelo de datos nuevo (complejos, usuarios/roles, canchas, schedules, turnos, reservas, clases, cobros) y seed de datos para desarrollo.
- **APIs**: endpoints REST nuevos para cada capacidad; autenticación JWT y autorización por rol.
- **Dependencias**: framework backend, cliente HTTP/ORM, librería de calendario y componentes de UI; sin pasarela de pagos.
- **Sistemas**: nueva infraestructura de base de datos y migraciones.