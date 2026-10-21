import 'dotenv/config';
import prisma from '../src/prisma';
import { generateTemporaryPassword, hashPassword } from '../src/services/auth.service';
import { ensureTurnsForRange, formatDate } from '../src/services/schedule.service';

// Loads a small demo dataset WITHOUT touching existing data, and removes it again.
//   npx tsx scripts/demo-data.ts          -> create
//   npx tsx scripts/demo-data.ts --remove -> delete (users cascade to everything)
const OWNER = 'demo-dueno@demo.tuturnito.test';
const PLAYER = 'demo-jugador@demo.tuturnito.test';

async function main() {
  if (process.argv.includes('--remove')) {
    const r = await prisma.user.deleteMany({ where: { email: { in: [OWNER, PLAYER] } } });
    console.log(`Borrados ${r.count} usuarios demo (y su complejo, canchas, turnos y reservas).`);
    return;
  }
  if (await prisma.user.findUnique({ where: { email: OWNER } })) {
    console.log('Los datos demo ya existen. Corré con --remove para borrarlos.');
    return;
  }
  const ownerPass = generateTemporaryPassword();
  const playerPass = generateTemporaryPassword();
  const owner = await prisma.user.create({
    data: { name: 'Dueño Demo', email: OWNER, passwordHash: await hashPassword(ownerPass), role: 'DUEÑO' },
  });
  await prisma.user.create({
    data: { name: 'Jugador Demo', email: PLAYER, passwordHash: await hashPassword(playerPass), role: 'JUGADOR' },
  });
  const complex = await prisma.complex.create({
    data: {
      name: 'Complejo Demo',
      slug: 'complejo-demo',
      location: 'Bahía Blanca',
      address: 'Calle Falsa 123',
      description: 'Complejo de prueba para verificar el deploy. Se puede borrar.',
      phone: '+54 9 291 000-0000',
      openingHours: 'Lunes a Domingo 08:00 - 23:00',
      ownerId: owner.id,
      courts: {
        create: [
          { name: 'Cancha 1', order: 0, openTime: '08:00', closeTime: '23:00', slotMinutes: 90, basePrice: 14000 },
          { name: 'Cancha 2', order: 1, openTime: '08:00', closeTime: '23:00', slotMinutes: 90, basePrice: 14000 },
        ],
      },
    },
  });
  const end = new Date();
  end.setDate(end.getDate() + 14);
  await ensureTurnsForRange(complex.id, formatDate(new Date()), formatDate(end));
  console.log(`Dueño:   ${OWNER}  /  ${ownerPass}`);
  console.log(`Jugador: ${PLAYER}  /  ${playerPass}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
