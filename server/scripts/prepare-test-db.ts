import { config } from 'dotenv';
import { execSync } from 'child_process';
import path from 'path';

// Pushes the current schema onto the dedicated local Postgres test database
// (tuturnito_test, see server/.env.test) before the test suite runs. Never
// touches the dev database (tuturnito_dev).
config({ path: path.resolve(__dirname, '../.env.test') });

execSync('npx prisma db push --skip-generate --accept-data-loss', {
  stdio: 'inherit',
  env: process.env,
  cwd: path.resolve(__dirname, '..'),
});
