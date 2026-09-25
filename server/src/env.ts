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
