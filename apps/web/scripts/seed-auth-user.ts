import { fileURLToPath } from 'node:url';
import { db } from '../server/db';
import { seedBaseUser } from '../server/auth/seed-user';

async function main() {
  try {
    const result = await seedBaseUser(db, {
      email: process.env.SEED_USER_EMAIL ?? 'demo@video-wizard.local',
      name: process.env.SEED_USER_NAME ?? 'Usuario de prueba',
      password: process.env.SEED_USER_PASSWORD,
      credentialFile: fileURLToPath(
        new URL('../../../.studio/bootstrap-user.json', import.meta.url)
      ),
    });
    console.log(result.created ? 'Usuario creado.' : 'Usuario existente.');
    if (result.credentialFile) console.log(result.credentialFile);
  } finally {
    await db.$client.end();
  }
}

main().catch(() => {
  console.error('No se pudo aprovisionar el usuario base.');
  process.exitCode = 1;
});
