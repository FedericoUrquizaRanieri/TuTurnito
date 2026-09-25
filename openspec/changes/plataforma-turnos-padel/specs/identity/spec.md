## Purpose

Registra e identifica a los usuarios de la plataforma (Jugador, Dueño de complejo y Profesor), gestiona su sesión y controla el acceso a las acciones según su rol.

## ADDED Requirements

### Requirement: Registro de usuarios con rol

El sistema SHALL permitir crear una cuenta eligiendo nombre, email, contraseña, teléfono y rol (Jugador, Dueño de complejo o Profesor). El email SHALL ser único y la contraseña SHALL guardarse de forma segura (hash). Cada usuario SHALL tener un único rol.

#### Scenario: Registro exitoso

- **WHEN** un visitante completa el formulario de registro con un email no utilizado y datos válidos
- **THEN** el sistema crea la cuenta, inicia la sesión y lleva al usuario a la pantalla correspondiente a su rol

#### Scenario: Email duplicado

- **WHEN** un visitante se registra con un email ya registrado
- **THEN** el sistema rechaza el registro y muestra un mensaje de que el email ya está en uso

### Requirement: Inicio y cierre de sesión

El sistema SHALL autenticar a los usuarios con email y contraseña y mantener una sesión válida. El usuario SHALL poder cerrar sesión en cualquier momento.

#### Scenario: Login correcto

- **WHEN** un usuario registrado ingresa email y contraseña correctos
- **THEN** el sistema lo autentica y lo lleva a la pantalla principal según su rol

#### Scenario: Credenciales inválidas

- **WHEN** un usuario ingresa email o contraseña incorrectos
- **THEN** el sistema muestra un mensaje de error y no inicia la sesión

#### Scenario: Cierre de sesión

- **WHEN** un usuario autenticado cierra sesión
- **THEN** la sesión se invalida y el sistema lo devuelve al inicio como visitante

### Requirement: Acceso por rol

El sistema SHALL restringir las acciones de administración según el rol del usuario: el Dueño solo administra sus propios complejos y su calendario; el Profesor opera sobre los complejos donde fue aceptado y sobre sus clases; el Jugador reserva turnos.

#### Scenario: Dueño accede a su panel

- **WHEN** un usuario con rol Dueño inicia sesión
- **THEN** el sistema habilita el panel de administración de su complejo y bloquea esas acciones para otros roles

#### Scenario: Profesor sin permiso

- **WHEN** un Profesor intenta modificar el calendario o cobros de un complejo al que no está vinculado
- **THEN** el sistema rechaza la acción y muestra un mensaje de acceso denegado

#### Scenario: Visitante reserva sin cuenta

- **WHEN** un visitante sin sesión intenta reservar
- **THEN** el sistema permite la reserva como invitado con nombre y contacto (ver reservations) e invita a crear una cuenta para gestionarla

### Requirement: Solicitud de profesor para unirse a un complejo

El sistema SHALL permitir a un Profesor solicitar su incorporación a un complejo; la solicitud queda pendiente de decisión del Dueño, y solo puede pedirse sobre complejos registrados.

#### Scenario: Solicitud pendiente

- **WHEN** un Profesor solicita unirse a un complejo y el Dueño aún no decide
- **THEN** el sistema registra la solicitud en estado pendiente y no habilita las funciones de profesor para ese complejo

#### Scenario: Aprobación de solicitud

- **WHEN** el Dueño aprueba la solicitud de un Profesor
- **THEN** el sistema vincula al Profesor con el complejo y habilita sus funciones de reserva y clases allí

#### Scenario: Rechazo de solicitud

- **WHEN** el Dueño rechaza la solicitud de un Profesor
- **THEN** el sistema notifica al Profesor y no lo vincula al complejo

### Requirement: Datos de perfil

El sistema SHALL permitir al usuario autenticado consultar y editar sus datos de perfil (nombre, teléfono, email) manteniendo un email válido y único.

#### Scenario: Edición de perfil

- **WHEN** un usuario autenticado actualiza su nombre y teléfono con datos válidos
- **THEN** el sistema guarda los cambios y muestra el perfil actualizado