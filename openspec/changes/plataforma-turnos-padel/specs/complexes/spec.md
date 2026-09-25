## Purpose

Muestra el catálogo público de complejos de padel registrados y la página pública de cada complejo con su información y turnos. Es la puerta de entrada por la que el jugador elige un lugar para jugar.

## ADDED Requirements

### Requirement: Catálogo de complejos

El sistema SHALL mostrar en el inicio el listado de todos los complejos registrados con nombre, ubicación, descripción breve, cantidad de canchas y rango de precios. El visitante SHALL poder seleccionar cualquiera de ellos para abrir su página.

#### Scenario: Listado visible en el inicio

- **WHEN** un visitante entra a la aplicación
- **THEN** ve las tarjetas de todos los complejos activos con su información y puede hacer clic en cada una para abrirla

### Requirement: Página pública del complejo

El sistema SHALL mostrar una página propia por complejo con su información completa y el calendario de turnos de las próximas fechas, con precios y estados (disponible, ocupado, bloqueado). El detalle de turnos y reserva se cubre en reservations.

#### Scenario: Apertura del complejo

- **WHEN** un visitante selecciona un complejo del catálogo
- **THEN** el sistema abre su página mostrando los datos del complejo y el calendario de turnos con precios

### Requirement: Creación de complejo por el Dueño

El sistema SHALL permitir a un Dueño registrar o crear su complejo indicando nombre, ubicación, descripción, contacto y horario de atención. El Dueño que crea el complejo queda como su administrador.

#### Scenario: Primer complejo del Dueño

- **WHEN** un Dueño registra un complejo con datos válidos
- **THEN** el sistema lo crea, lo asocia al Dueño y lo agrega al catálogo público

#### Scenario: Dueño sin complejo en su inicio

- **WHEN** un Dueño inicia sesión y aún no tiene complejo
- **THEN** el sistema lo invita a crear o registrar su complejo antes de acceder al panel

### Requirement: Edición de información del complejo

El sistema SHALL permitir únicamente al Dueño administrador del complejo editar su información pública.

#### Scenario: Edición por el Dueño administrador

- **WHEN** el Dueño administrador modifica la información de su complejo y confirma
- **THEN** el sistema guarda los cambios y el catálogo refleja la nueva información

#### Scenario: Acceso de otro Dueño

- **WHEN** un Dueño que no administra ese complejo intenta editarlo
- **THEN** el sistema rechaza la operación con un mensaje de acceso denegado

### Requirement: Búsqueda y filtrado de complejos

El sistema SHALL permitir buscar complejos por nombre y filtrar por ubicación dentro del catálogo.

#### Scenario: Filtro por nombre y ubicación

- **WHEN** un visitante filtra el catálogo por nombre y/o ubicación
- **THEN** el sistema muestra únicamente los complejos que coinciden con el filtro

### Requirement: Complejo inexistente

El sistema SHALL mostrar un error de página no encontrada cuando se intenta abrir un complejo que no existe o fue desactivado.

#### Scenario: Apertura de complejo inexistente

- **WHEN** un visitante accede a la URL de un complejo inexistente o desactivado
- **THEN** el sistema muestra un mensaje "complejo no encontrado" sin sugerir que puede reservar