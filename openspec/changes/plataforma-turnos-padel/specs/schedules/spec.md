## Purpose

Define el "Excel de canchas": un grid semanal editable del Dueño que establece las canchas, los turnos, los precios y la disponibilidad de su complejo y que alimenta el calendario público.

## ADDED Requirements

### Requirement: Visualización del grid semanal

El sistema SHALL mostrar al Dueño de un complejo un grid con filas = canchas y columnas = segmentos de horario por día de la semana, similar a una planilla de Excel, con el estado y el precio de cada celda.

#### Scenario: El Dueño abre el Excel de canchas

- **WHEN** un Dueño accede al panel de su complejo
- **THEN** ve el grid semanal con las canchas en filas y los turnos por día/hora en columnas, mostrando el estado (disponible o bloqueado) y el precio de cada celda

### Requirement: Administración de canchas

El sistema SHALL permitir al Dueño agregar y quitar canchas de su complejo dentro del grid.

#### Scenario: Alta de cancha

- **WHEN** el Dueño agrega una cancha nueva con su nombre y guarda
- **THEN** aparece como nueva fila en el grid con todas sus celdas disponibles

#### Scenario: Baja de cancha con reservas futuras

- **WHEN** el Dueño intenta quitar una cancha que tiene turnos futuros reservados
- **THEN** el sistema lo advierte y le exige decidir entre conservar o cancelar esas reservas antes de completar la baja

### Requirement: Edición de celdas (disponibilidad y precio)

El sistema SHALL permitir al Dueño editar cada celda del grid para fijar su estado (disponible o bloqueado) y su precio. La semana configurada constituye un template semanal recurrente que genera las ocurrencias de turnos públicos.

#### Scenario: Marcar turno como bloqueado

- **WHEN** el Dueño marca una celda como bloqueada y guarda
- **THEN** las ocurrencias de esos turnos aparecen bloqueadas en el calendario público y no son reservables

#### Scenario: Cambio de precio

- **WHEN** el Dueño edita el precio de una celda y guarda
- **THEN** el calendario público muestra el nuevo precio para las ocurrencias de esos turnos

### Requirement: Guardado y reflejo en el calendario público

El sistema SHALL guardar el grid de forma explícita (botón guardar), persistirlo como fuente de verdad y SHALL traducirlo al calendario público: cada celda genera sus ocurrencias en fechas reales marcando disponible o bloqueado según el estado, con su precio, y respetando los turnos ya reservados.

#### Scenario: Reflejo del grid en el calendario

- **WHEN** un Dueño guarda cambios en su grid
- **THEN** el calendario público de su complejo muestra de inmediato las nuevas disponibilidades, precios y bloqueos para las próximas fechas, sin perder los turnos ya ocupados

#### Scenario: Turno reservado

- **WHEN** una celda disponible tiene ocurrencias ya reservadas
- **THEN** el calendario público muestra esas ocurrencias como ocupadas y las restantes como disponibles

### Requirement: Validación de conflictos al guardar

El sistema SHALL impedir guardar el grid cuando se intente bloquear o quitar una celda que tenga ocurrencias futuras reservadas y estas no hayan sido resueltas (conservar o cancelar) por el Dueño.

#### Scenario: Bloqueo con reservas futuras

- **WHEN** el Dueño intenta bloquear una celda con ocurrencias futuras reservadas sin resolverlas
- **THEN** el sistema advierte el conflicto y no guarda hasta que el Dueño decida conservar o cancelar esas reservas

#### Scenario: Guardado sin conflictos

- **WHEN** el Dueño guarda un grid sin conflictos
- **THEN** el sistema confirma el guardado y actualiza el calendario público

### Requirement: Exportación e importación opcional de .xlsx

El sistema SHALL permitir exportar el grid a un archivo .xlsx y volver a importarlo desde un .xlsx que respete la misma estructura (canchas en filas y turnos en columnas con precio y estado).

#### Scenario: Exportar grid

- **WHEN** el Dueño exporta su grid
- **THEN** el sistema descarga un archivo .xlsx que reproduce la planilla (canchas, turnos, precios y estados)

#### Scenario: Importar grid inválido

- **WHEN** el Dueño importa un .xlsx con una estructura distinta a la esperada
- **THEN** el sistema rechaza el archivo con un mensaje de error y deja el grid vigente sin modificar