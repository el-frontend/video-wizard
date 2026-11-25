import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';

import * as schema from '@/server/db/schema';
import { provisionCatalog } from '@/server/services/studio/provision-catalog';

async function main() {
  const ownerId = z.uuid().safeParse(process.argv[2]);
  const connectionString = process.env.DATABASE_URL;
  if (!ownerId.success || process.argv.length !== 3 || !connectionString) {
    throw new Error('Configura DATABASE_URL y pasa el UUID de un usuario de Studio.');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool, schema });
  try {
    const [owner] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, ownerId.data));
    if (!owner) throw new Error('El usuario de Studio no existe.');

    const counts = await provisionCatalog(db, owner.id);
    console.log(
      `${counts.styles} estilos, ${counts.components} componentes de subtítulos, ${counts.brands} marca, ${counts.templates} plantillas.`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error && !('cause' in error) ? error.message : '';
  console.error('No se pudo sembrar la biblioteca de Studio.', detail);
  process.exitCode = 1;
});
