import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ensureTurnsForRange, formatDate } from '../src/services/schedule.service';

const prisma = new PrismaClient();

// Guard: this script wipes every table. It's only ever safe to run against a
// local dev/test database — never against a shared/production DB once
// DATABASE_URL points somewhere else (see server/docs/database.md).
function assertSafeToSeed() {
  const url = process.env.DATABASE_URL || '';
  const isLocalSqlite = url.startsWith('file:');
  const isLocalPostgres = /^postgres(ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
  const isLocal = isLocalSqlite || isLocalPostgres;
  if (process.env.NODE_ENV === 'production' || !isLocal) {
    throw new Error(
      `Seed abortado: DATABASE_URL ("${url}") no parece ser una base local de desarrollo. ` +
        'Este script borra todas las tablas y solo debe correr contra SQLite local o Postgres en localhost/127.0.0.1.'
    );
  }
}

async function main() {
  assertSafeToSeed();
  console.log('🌱 Iniciando carga de datos de prueba (Seed)...');

  // Clean existing database
  await prisma.payment.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.turn.deleteMany({});
  await prisma.templateCell.deleteMany({});
  await prisma.court.deleteMany({});
  await prisma.professorRequest.deleteMany({});
  await prisma.professorComplex.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.complex.deleteMany({});
  await prisma.user.deleteMany({});

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('padel123', salt);

  // 1. Create Users
  console.log('👤 Creando usuarios...');
  const owner = await prisma.user.create({
    data: {
      name: 'Carlos Dueño',
      email: 'dueno@padel.com',
      passwordHash,
      phone: '+54 9 291 456-7890',
      role: 'DUEÑO',
    },
  });

  const professor = await prisma.user.create({
    data: {
      name: 'Martín Profe',
      email: 'profe@padel.com',
      passwordHash,
      phone: '+54 9 291 567-8901',
      role: 'PROFESOR',
    },
  });

  const player = await prisma.user.create({
    data: {
      name: 'Federico Jugador',
      email: 'jugador@padel.com',
      passwordHash,
      phone: '+54 9 291 678-9012',
      role: 'JUGADOR',
    },
  });

  // 2. Create Complexes
  console.log('🏟️ Creando complejos y canchas...');
  const complex1 = await prisma.complex.create({
    data: {
      name: 'Pádel Master Club Bahía',
      location: 'Bahía Blanca',
      address: 'Av. Alem 1850',
      description: 'El club de pádel más completo de Bahía Blanca. Canchas profesionales panorámicas con césped texturado e iluminación LED de alta potencia. Bar, vestuarios y estacionamiento privado.',
      phone: '+54 9 291 456-7890',
      openingHours: 'Lunes a Domingo 08:00 - 23:30',
      imageUrl: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
      ownerId: owner.id,
      courts: {
        create: [
          { name: 'Cancha 1 Panorámica Pro', order: 0 },
          { name: 'Cancha 2 Cristal Central', order: 1 },
          { name: 'Cancha 3 Cubierta Premium', order: 2 },
        ],
      },
    },
    include: { courts: true },
  });

  const complex2 = await prisma.complex.create({
    data: {
      name: 'Pádel Point Palermo',
      location: 'Palermo, CABA',
      address: 'Av. del Libertador 4200',
      description: '4 canchas techadas de última generación en el corazón de Palermo. Clases personalizadas, torneos semanales, confitería y tienda oficial.',
      phone: '+54 11 4789-0123',
      openingHours: 'Lunes a Domingo 07:00 - 00:00',
      imageUrl: 'https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?auto=format&fit=crop&w=1200&q=80',
      ownerId: owner.id,
      courts: {
        create: [
          { name: 'Cancha Central A', order: 0 },
          { name: 'Cancha B Panorámica', order: 1 },
        ],
      },
    },
    include: { courts: true },
  });

  // 3. Create Weekly Schedule (TemplateCells) for complex1
  console.log('📅 Configurando plantilla semanal del Excel de canchas...');
  const timeSlots = [
    { start: '08:00', end: '09:30', price: 12000 },
    { start: '09:30', end: '11:00', price: 12000 },
    { start: '11:00', end: '12:30', price: 10000 },
    { start: '14:00', end: '15:30', price: 10000 },
    { start: '15:30', end: '17:00', price: 12000 },
    { start: '17:00', end: '18:30', price: 16000 },
    { start: '18:30', end: '20:00', price: 18000 },
    { start: '20:00', end: '21:30', price: 18000 },
    { start: '21:30', end: '23:00', price: 16000 },
  ];

  const templateCellsData: any[] = [];

  for (const court of complex1.courts) {
    for (let day = 0; day <= 6; day++) {
      for (const slot of timeSlots) {
        // Bloquear domingo a las 8am en cancha 3 por mantenimiento
        const isBlocked = court.order === 2 && day === 0 && slot.start === '08:00';
        templateCellsData.push({
          courtId: court.id,
          dayOfWeek: day,
          startTime: slot.start,
          endTime: slot.end,
          price: slot.price,
          availability: isBlocked ? 'BLOCKED' : 'AVAILABLE',
        });
      }
    }
  }

  // Also templates for complex2
  for (const court of complex2.courts) {
    for (let day = 0; day <= 6; day++) {
      for (const slot of timeSlots) {
        templateCellsData.push({
          courtId: court.id,
          dayOfWeek: day,
          startTime: slot.start,
          endTime: slot.end,
          price: slot.price + 2000,
          availability: 'AVAILABLE',
        });
      }
    }
  }

  await prisma.templateCell.createMany({
    data: templateCellsData,
  });

  // 4. Materialize turns for the next 14 days
  console.log('⚡ Generando turnos para las próximas 2 semanas...');
  const today = new Date();
  const todayStr = formatDate(today);
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + 14);
  const futureStr = formatDate(futureDate);

  await ensureTurnsForRange(complex1.id, todayStr, futureStr);
  await ensureTurnsForRange(complex2.id, todayStr, futureStr);

  // 5. Connect Professor to Complex1
  console.log('🤝 Vinculando profesor al complejo...');
  await prisma.professorComplex.create({
    data: {
      professorId: professor.id,
      complexId: complex1.id,
      active: true,
    },
  });

  // Create Professor Students
  console.log('🎓 Creando alumnos del profesor y registros de cobro...');
  const student1 = await prisma.student.create({
    data: {
      professorId: professor.id,
      name: 'Lucas Alumno',
      phone: '+54 9 291 411-2233',
      email: 'lucas@gmail.com',
      notes: 'Nivel 5ta categoría. Clases martes y jueves.',
    },
  });

  const student2 = await prisma.student.create({
    data: {
      professorId: professor.id,
      name: 'Camila Gómez',
      phone: '+54 9 291 422-3344',
      email: 'camila@gmail.com',
      notes: 'Iniciación. Clases individuales.',
    },
  });

  const student3 = await prisma.student.create({
    data: {
      professorId: professor.id,
      name: 'Esteban Páez',
      phone: '+54 9 291 433-4455',
      notes: 'Clase grupal fin de semana.',
    },
  });

  // Payments for students
  await prisma.payment.createMany({
    data: [
      {
        payableType: 'STUDENT_CLASS',
        payableId: student1.id,
        amount: 15000,
        status: 'PAID',
        date: todayStr,
        recordedById: professor.id,
        notes: 'Abono mensual 4 clases',
      },
      {
        payableType: 'STUDENT_CLASS',
        payableId: student2.id,
        amount: 8000,
        status: 'PENDING',
        date: todayStr,
        recordedById: professor.id,
        notes: 'Clase particular pendiente',
      },
      {
        payableType: 'STUDENT_CLASS',
        payableId: student3.id,
        amount: 6000,
        status: 'PAID',
        date: todayStr,
        recordedById: professor.id,
        notes: 'Clase grupal',
      },
    ],
  });

  // 6. Create Demo Reservations
  console.log('🎾 Creando reservas de prueba...');
  // Find a turn for tomorrow at 18:30 in Cancha 1
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);

  const turnTomorrow = await prisma.turn.findFirst({
    where: {
      courtId: complex1.courts[0].id,
      date: tomorrowStr,
      startTime: '18:30',
    },
  });

  if (turnTomorrow) {
    await prisma.turn.update({
      where: { id: turnTomorrow.id },
      data: { state: 'OCCUPIED' },
    });

    const reservation1 = await prisma.reservation.create({
      data: {
        turnId: turnTomorrow.id,
        complexId: complex1.id,
        userId: player.id,
        guestName: player.name,
        guestPhone: player.phone || '2914567890',
        guestEmail: player.email,
        type: 'PLAYER',
        notes: 'Partido 4ta categoría con amigos',
      },
    });

    await prisma.payment.create({
      data: {
        payableType: 'RESERVATION',
        payableId: reservation1.id,
        amount: turnTomorrow.price,
        status: 'PAID',
        date: tomorrowStr,
        recordedById: owner.id,
        notes: 'Cobro en efectivo en recepción',
      },
    });
  }

  // Find a turn for day after tomorrow at 17:00 in Cancha 2 for Professor Class
  const inTwoDays = new Date();
  inTwoDays.setDate(today.getDate() + 2);
  const inTwoDaysStr = formatDate(inTwoDays);

  const turnClass = await prisma.turn.findFirst({
    where: {
      courtId: complex1.courts[1].id,
      date: inTwoDaysStr,
      startTime: '17:00',
    },
  });

  if (turnClass) {
    await prisma.turn.update({
      where: { id: turnClass.id },
      data: { state: 'OCCUPIED' },
    });

    const resClass = await prisma.reservation.create({
      data: {
        turnId: turnClass.id,
        complexId: complex1.id,
        userId: professor.id,
        guestName: 'Clase Pádel - Martín Profe',
        guestPhone: professor.phone || '2915678901',
        guestEmail: professor.email,
        type: 'CLASS',
        professorId: professor.id,
        notes: 'Clase de táctica y volea con alumnos',
      },
    });

    await prisma.payment.create({
      data: {
        payableType: 'RESERVATION',
        payableId: resClass.id,
        amount: turnClass.price,
        status: 'PENDING',
        date: inTwoDaysStr,
        recordedById: owner.id,
        notes: 'Pendiente de cobro al profesor',
      },
    });
  }

  console.log('✅ Seed completado con éxito.');
  console.log('🔑 Credenciales demo:');
  console.log('   - Dueño:    dueno@padel.com    / padel123');
  console.log('   - Profesor: profe@padel.com    / padel123');
  console.log('   - Jugador:  jugador@padel.com  / padel123');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
