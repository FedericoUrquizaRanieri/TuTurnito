# 🎾 TuTurnito — Plataforma Integral de Gestión y Reserva de Pádel

> **TuTurnito** es una aplicación web full-stack diseñada para modernizar y centralizar la reserva de turnos, gestión de clubes y administración de clases de pádel. Conecta en un único ecosistema a **jugadores**, **dueños de complejos** y **profesores**.

---

## 🌟 ¿Qué problema resuelve?

Tradicionalmente, la reserva de canchas y la organización de clases se maneja de forma fragmentada a través de mensajes de WhatsApp, llamadas y planillas de cálculo propensas a errores. 

**TuTurnito** transforma este proceso ofreciendo:
- **Para Jugadores:** Reserva de turnos en tiempo real, búsqueda de complejos con URLs personalizadas y un sistema de *Partidos Abiertos* para completar parejas.
- **Para Dueños:** Una grilla interactiva en vivo ("Excel de canchas"), fijación de turnos semanales, tarifas dinámicas (horas pico/promociones), cierres programados con detección de conflictos y analíticas de negocio en tiempo real.
- **Para Profesores:** Gestión integral de clases recurrentes, control de asistencia, cuentas corrientes de alumnos y cálculo automático de rentabilidad.

---

## 💡 Aspectos Técnicos Destacados (Engineering Highlights)

Este proyecto fue desarrollado aplicando buenas prácticas de ingeniería de software, arquitectura escalable y patrones de diseño modernos:

### 1. ⚙️ Lógica de Dominio Compleja y Concurrencia
- **Generación Dinámica de Turnos:** Algoritmo que materializa turnos en tiempo real combinando horarios base de canchas, turnos fijos semanales, horarios de profesores y cierres extraordinarios, respetando anulaciones manuales (*manual overrides*).
- **Detección Inteligente de Conflictos:** Validación atómica de solapamientos al modificar la configuración de canchas, horarios o al programar cierres de complejos.
- **Prevención de Double-Booking:** Transacciones seguras a nivel de base de datos para garantizar consistencia en reservas concurrentes y control estricto de cupos en partidos abiertos.
- **Motor Financiero para Profesores:** Histórico de tarifas por inscripción (`ClassEnrollmentPrice`) para recalcular deudas de alumnos sin afectar cobros pasados ante aumentos de precios.

### 2. 🛡️ Seguridad y Robustez
- **Autenticación Segura:** JWT transmitido exclusivamente mediante cookies `httpOnly`, con control de roles (`JUGADOR`, `DUEÑO`, `PROFESOR`) y re-autenticación obligatoria para cambios sensibles de credenciales.
- **Rate Limiting Multinivel:** Protección contra abusos y fuerza bruta diferenciada por IP (endpoints generales, registro) y por usuario autenticado (prevención de reservas masivas).
- **Validación Estricta:** Tipado estático de punta a punta con TypeScript y validación de esquemas en runtime con `Zod`.
- **Integración Anti-Bot:** Soporte para captcha invisible con Cloudflare Turnstile.

### 3. 📊 Visualización de Datos y Analíticas
- Dashboards interactivos implementados con `Recharts` que calculan tasas de ocupación, ingresos proyectados vs. cobrados, deuda acumulada, retención de clientes y estadísticas de cancelaciones.

### 4. 🧪 Calidad de Código y Testing Automatizado
- Suite completa con **20 archivos de pruebas de integración** utilizando `Vitest` y `Supertest`, ejecutados sobre una base de datos PostgreSQL aislada para garantizar confiabilidad sin alterar datos de desarrollo.

---

## 🛠️ Stack Tecnológico

| Área | Tecnologías |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, React Router DOM 6, Recharts, Lucide Icons, Vanilla CSS |
| **Backend** | Node.js, Express, TypeScript (`tsx`), Prisma ORM, PostgreSQL |
| **Seguridad & Auth** | JWT (`httpOnly` cookies), Bcrypt, Helmet, Express Rate Limit, Cloudflare Turnstile |
| **Testing** | Vitest, Supertest |
| **Mailing & Jobs** | Nodemailer (SMTP / local logger), Background Cron/Interval Job |
| **Arquitectura** | Monorepo con npm workspaces (`/server` y `/web`) |

---

## 🚀 Inicio Rápido en 3 Pasos

### 1. Clonar e Instalar
```bash
git clone https://github.com/FedericoUrquizaRanieri/TuTurnito.git
cd TuTurnito
npm install
```

### 2. Configurar Base de Datos y Variables
Creá las bases en tu PostgreSQL local (`tuturnito_dev` y `tuturnito_test`) y configurá el archivo de entorno:
```bash
cp server/.env.example server/.env
# Ajustá tu DATABASE_URL en server/.env
```

Aplicá las migraciones y cargá los datos de prueba:
```bash
npm run prisma:migrate
npm run seed
```

### 3. Ejecutar la Aplicación
```bash
npm run dev
```
- **Web:** `http://localhost:5173`
- **API:** `http://localhost:4000`

---

## 🔑 Cuentas Demo para Probar

El comando `npm run seed` precarga cuentas listas para explorar los 3 paneles:

- 🏢 **Dueño:** `dueno@padel.com` / `padel123` *(Panel de administración de complejo, canchas y métricas)*
- 🎓 **Profesor:** `profe@padel.com` / `padel123` *(Panel de clases semanales, cobros y alumnos)*
- 🎾 **Jugador:** `jugador@padel.com` / `padel123` *(Reserva de turnos y partidos abiertos)*

---

## 🧪 Ejecución de Tests
```bash
npm test
```
Ejecuta la suite completa de integración de forma automatizada sobre `tuturnito_test`.