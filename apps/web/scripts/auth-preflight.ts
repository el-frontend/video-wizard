import { db } from '../server/db';
import { migrationPreflight } from '../server/auth/migration-preflight';

async function main() {
  try {
    const counts = await migrationPreflight(db);
    console.log(JSON.stringify(counts));
    if (counts.collisions > 0) process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}

main().catch(() => {
  console.error('No se pudo comprobar la base de datos.');
  process.exitCode = 1;
});
