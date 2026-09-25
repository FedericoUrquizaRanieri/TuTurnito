import { config } from 'dotenv';
import path from 'path';

// Runs before any test file's imports, so DATABASE_URL/JWT_SECRET etc. are
// already in process.env by the time `src/index.ts` (and its transitive
// `src/env.ts`/`src/prisma.ts` imports) load — `dotenv.config()` never
// overrides a var that's already set, so these values win over `.env`.
config({ path: path.resolve(__dirname, '../.env.test') });
