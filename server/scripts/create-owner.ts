import 'dotenv/config';
import { parseArgs } from 'util';
import prisma from '../src/prisma';
import { createOwnerAccount, generateTemporaryPassword } from '../src/services/auth.service';

// Creates the account of a complex owner who's joining the platform (owners
// can't sign up on their own). Prints a temporary password to hand over; the
// owner changes it from their profile.
//
//   npm run create-owner -- --email dueno@complejo.com --name "Juan Pérez" --phone 2914567890
//   npm run create-owner -- --email jugador@mail.com --promote   (an existing account becomes an owner)

const USAGE = 'Uso: npm run create-owner -- --email <email> --name "<nombre>" [--phone <teléfono>] [--promote]';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      phone: { type: 'string' },
      promote: { type: 'boolean', default: false },
    },
  });

  if (!values.email || (!values.name && !values.promote)) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const password = generateTemporaryPassword();
  const user = await createOwnerAccount({
    email: values.email,
    name: values.name ?? '',
    phone: values.phone,
    password,
    promote: values.promote,
  });

  console.log(`Cuenta de dueño lista: ${user.name} <${user.email}>`);
  console.log(`Contraseña temporal: ${password}`);
  console.log('Pasásela al dueño y pedile que la cambie desde "Mi perfil". No se vuelve a mostrar.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
