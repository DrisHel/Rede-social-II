import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_DB_PATH = path.join(os.tmpdir(), 'rede-social-test.db');
export const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;

export default function setup(): void {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
