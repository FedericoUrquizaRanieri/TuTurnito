import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { addDays, buildCourtSlots, ensureTurnsForRange, formatDate, parseDateString } from '../src/services/schedule.service';

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
  await prisma.fixedBooking.deleteMany({});
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
          { name: 'Cancha 1 Panorámica Pro', order: 0, openTime: '08:00', closeTime: '23:00', slotMinutes: 90, basePrice: 14000 },
          { name: 'Cancha 2 Cristal Central', order: 1, openTime: '08:00', closeTime: '23:00', slotMinutes: 90, basePrice: 14000 },
          { name: 'Cancha 3 Cubierta Premium', order: 2, openTime: '09:00', closeTime: '24:00', slotMinutes: 60, basePrice: 12000 },
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
          { name: 'Cancha Central A', order: 0, openTime: '07:00', closeTime: '23:30', slotMinutes: 90, basePrice: 16000 },
          { name: 'Cancha B Panorámica', order: 1, openTime: '07:00', closeTime: '23:30', slotMinutes: 90, basePrice: 16000 },
        ],
      },
    },
    include: { courts: true },
  });

  // 4. Materialize turns for the next 14 days
  console.log('⚡ Generando turnos para las próximas 2 semanas...');
  const today = new Date();
  const todayStr = formatDate(today);
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + 14);
  const futureStr = formatDate(futureDate);

  // Fixed booking first, so materializing the turns already books it.
  const fixedDay = 2; // Martes
  await prisma.fixedBooking.create({
    data: {
      complexId: complex1.id,
      courtId: complex1.courts[0].id,
      dayOfWeek: fixedDay,
      startTime: '20:00',
      guestName: 'Grupo de los Martes',
      guestPhone: '+54 9 291 455-6677',
      notes: 'Turno fijo semanal',
      startDate: todayStr,
    },
  });

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

  // 7. Owner edits on concrete dates: a tournament and a maintenance block
  console.log('🏆 Marcando torneo y bloqueo de mantenimiento...');
  const tournamentDate = addDays(todayStr, 3);
  await prisma.turn.updateMany({
    where: {
      courtId: complex1.courts[1].id,
      date: tournamentDate,
      startTime: { in: ['18:30', '20:00'] },
      state: 'AVAILABLE',
    },
    data: { state: 'TOURNAMENT', label: 'Torneo Relámpago', manualOverride: true },
  });
  await prisma.turn.updateMany({
    where: { courtId: complex1.courts[2].id, date: addDays(todayStr, 4), startTime: '09:00', state: 'AVAILABLE' },
    data: { state: 'BLOCKED', manualOverride: true },
  });

  // 8. Last week's history (past days are never auto-generated), so the
  // owner grid has something to review and the weekly totals aren't empty.
  console.log('🕘 Cargando historial de la última semana...');
  const pastGuests = ['Juan Pérez', 'Lucía Fernández', 'Diego Ramírez', 'Sofía Martínez', 'Tomás Gutiérrez'];
  for (let back = 7; back >= 1; back--) {
    const dateStr = addDays(todayStr, -back);
    for (const court of complex1.courts) {
      const slots = buildCourtSlots(court);
      await prisma.turn.createMany({
        data: slots.map((slot) => ({
          courtId: court.id,
          date: dateStr,
          startTime: slot.start,
          endTime: slot.end,
          price: court.basePrice,
        })),
        skipDuplicates: true,
      });

      // Book the evening slots on alternating days/courts
      const eveningSlots = slots.filter((slot) => slot.start >= '18:00').slice(0, 2);
      for (const [i, slot] of eveningSlots.entries()) {
        if ((back + court.order + i) % 2 !== 0) continue;
        const turn = await prisma.turn.update({
          where: { courtId_date_startTime: { courtId: court.id, date: dateStr, startTime: slot.start } },
          data: { state: 'OCCUPIED' },
        });
        const guestName = pastGuests[(back + court.order + i) % pastGuests.length];
        const pastRes = await prisma.reservation.create({
          data: {
            turnId: turn.id,
            complexId: complex1.id,
            guestName,
            guestPhone: '+54 9 291 400-0000',
            type: 'PLAYER',
          },
        });
        await prisma.payment.create({
          data: {
            payableType: 'RESERVATION',
            payableId: pastRes.id,
            amount: turn.price,
            status: parseDateString(dateStr).dayOfWeek % 3 === 0 ? 'PENDING' : 'PAID',
            date: dateStr,
            recordedById: owner.id,
          },
        });
      }
    }
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
