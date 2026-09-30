import dotenv from 'dotenv';

// Side-effect import: must be the very first thing `index.ts` imports so
// `.env` is loaded before any other module reads `process.env` at module
// top-level (e.g. `middleware/auth.ts`, `routes/auth.routes.ts`).
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copiá server/.env.example a server/.env y completá los valores antes de levantar el servidor.`
    );
  }
  return value;
}

export const JWT_SECRET = requireEnv('JWT_SECRET');

// A short secret can be brute-forced offline from any token, which lets
// anyone sign sessions as any user (owners included).
if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET tiene que tener al menos 32 caracteres en producción. Generá uno con: openssl rand -base64 48');
}
