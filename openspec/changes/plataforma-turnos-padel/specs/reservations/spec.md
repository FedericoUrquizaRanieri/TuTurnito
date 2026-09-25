## Purpose

Expone el calendario de turnos de cada complejo con sus estados y precios, permite reservar un turno libre mediante un formulario y registrar manualmente los cobros de cada reserva.

## ADDED Requirements

### Requirement: Calendario de turnos por complejo

El sistema SHALL mostrar, en la página pública del complejo, el calendario de las próximas fechas con cada turno en estado disponible, ocupado o bloqueado y su precio, de acuerdo con el grid del Dueño (ver schedules).

#### Scenario: Visión del calendario

- **WHEN** un visitante abre la página de un complejo
- **THEN** ve un calendario con los turnos de las próximas fechas, su estado y su precio

### Requirement: Reserva de un turno disponible

El sistema SHALL permitir reservar un turno disponible mediante un formulario en un modal que solicita el nombre y contacto del jugador, y opcionalmente vincula la reserva a una cuenta autenticada. Al confirmar, el turno pasa a ocupado.

#### Scenario: Reserva exitosa

- **WHEN** un usuario selecciona un turno disponible, completa el formulario y confirma
- **THEN** el sistema crea la reserva, marca el turno como ocupado y muestra la confirmación con los datos de la reserva

#### Scenario: Reserva como invitado

- **WHEN** un visitante sin cuenta reserva indicando nombre y contacto
- **THEN** el sistema crea la reserva y le ofrece crear una cuenta para gestionarla

### Requirement: Prevención de doble reserva

El sistema SHALL impedir que dos reservas ocupen el mismo turno simultáneamente. Una vez ocupado, el turno deja de ofrecerse para reserva.

#### Scenario: Intento sobre turno recién ocupado

- **WHEN** dos usuarios intentan reservar el mismo turno y una de las reservas se confirma primero
- **THEN** el sistema muestra el turno como ocupado al segundo usuario y le ofrece otros turnos disponibles

### Requirement: Turnos no reservables

El sistema SHALL impedir la reserva de turnos ocupados o bloqueados mostrando su estado sin acción de reserva disponible.

#### Scenario: Turno bloqueado

- **WHEN** un usuario intenta reservar un turno bloqueado por el Dueño
- **THEN** el sistema no permite reservarlo y muestra que está bloqueado

#### Scenario: Turno ocupado

- **WHEN** un usuario intenta reservar un turno ya ocupado
- **THEN** el sistema no permite reservarlo y muestra que está ocupado

### Requirement: Cancelación de reservas

El sistema SHALL permitir cancelar una reserva por el jugador que la realizó o por el Dueño, liberando el turno para una nueva reserva.

#### Scenario: Cancelación por el jugador

- **WHEN** el jugador cancela su reserva
- **THEN** el sistema libera el turno (queda disponible) y elimina la reserva

#### Scenario: Cancelación por el Dueño

- **WHEN** el Dueño cancela una reserva de su complejo
- **THEN** el sistema libera el turno y registra la cancelación

### Requirement: Gestión de cobros de turnos

El sistema SHALL permitir al Dueño registrar manualmente el cobro de una reserva (monto y estado pagado o pendiente) sin pasarela de pagos, y consultar los cobros de su complejo.

#### Scenario: Marcar reserva como pagada

- **WHEN** el Dueño registra el cobro de una reserva indicando su monto
- **THEN** la reserva queda con estado pagado y el monto se incorpora al total cobrado del complejo

#### Scenario: Lista de reservas del complejo

- **WHEN** el Dueño consulta las reservas de su complejo
- **THEN** ve el estado de pago (pagado o pendiente) y el monto de cada reserva

### Requirement: Historial de reservas del jugador

El sistema SHALL permitir a un jugador autenticado ver las reservas que realizó con su complejo, turno, estado y estado de pago.

#### Scenario: Ver mis reservas

- **WHEN** un jugador autenticado ingresa a "Mis reservas"
- **THEN** el sistema lista sus reservas con complejo, turno, estado y estado de pago