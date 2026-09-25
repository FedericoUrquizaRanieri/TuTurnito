## Purpose

Permite a los profesores operar dentro de los complejos donde fueron aceptados: reservar canchas para sus clases, administrar los alumnos y registrar los cobros de cada clase.

## ADDED Requirements

### Requirement: Reserva de cancha para clase

El sistema SHALL permitir a un Profesor aceptado en un complejo reservar turnos allí y marcarlos como clase propia, siguiendo el mismo flujo de disponibilidad de reservations.

#### Scenario: Reserva de clase

- **WHEN** un Profesor aceptado selecciona un turno libre de su complejo y lo reserva como clase
- **THEN** el sistema crea la reserva asociada al Profesor, la identifica como clase y permite asociarle alumnos

#### Scenario: Profesor no aceptado

- **WHEN** un Profesor intenta reservar en un complejo donde no fue aceptado
- **THEN** el sistema rechaza la operación con un mensaje de acceso denegado

### Requirement: Administración de alumnos

El sistema SHALL permitir al Profesor listar, agregar y quitar alumnos de sus clases, con nombre y contacto de cada alumno.

#### Scenario: Alta de alumno

- **WHEN** un Profesor agrega un alumno con sus datos
- **THEN** el sistema lo incorpora a la lista de alumnos del Profesor y lo asocia a la clase correspondiente

#### Scenario: Baja de alumno

- **WHEN** un Profesor quita un alumno de una clase
- **THEN** el sistema deja de incluirlo en esa clase y conserva el historial de cobros del alumno

### Requirement: Registro de cobros de clases

El sistema SHALL permitir al Profesor registrar cobros por alumno (monto, fecha y estado pagado o pendiente) y consultar el historial de cobros de cada alumno.

#### Scenario: Pago de una clase

- **WHEN** un Profesor registra un cobro de un alumno con su monto
- **THEN** el sistema guarda el cobro con fecha y lo muestra en el historial del alumno

#### Scenario: Saldo pendiente

- **WHEN** un Profesor consulta el estado de un alumno
- **THEN** el sistema muestra el saldo pendiente si existen cobros registrados como pendientes

### Requirement: Consulta del historial del Profesor

El sistema SHALL permitir al Profesor ver el historial de sus reservas de clase y de los cobros que registró por periodo.

#### Scenario: Historial del Profesor

- **WHEN** un Profesor consulta su panel
- **THEN** ve sus reservas de clase pasadas y futuras y el detalle de cobros por alumno