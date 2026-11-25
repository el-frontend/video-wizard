import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db';
import { jobs } from '@/server/db/schema';
import { ServiceError } from '@/server/lib/utils';

export const UNKNOWN_RENDER_ADMISSION =
  'No se pudo confirmar la admisión de esta exportación. Comprueba el trabajo con el operador antes de iniciar otra.';
export class UnknownRenderAdmissionError extends Error {
  constructor() {
    super(UNKNOWN_RENDER_ADMISSION);
  }
}
const submitting = { phase: 'submitting' } as const;
const accepted = z.strictObject({ phase: z.literal('accepted'), rendererJobId: z.uuid() });

function processingRender(owner: string, webJobId: string) {
  return and(
    eq(jobs.id, webJobId),
    eq(jobs.userId, owner),
    eq(jobs.type, 'render'),
    eq(jobs.status, 'processing')
  );
}

export const renderAdmission = {
  /** Only the caller that commits the reservation may send the initial POST. */
  async reserve(owner: string, webJobId: string): Promise<string | null> {
    const job = processingRender(owner, webJobId);
    const [reserved] = await db
      .update(jobs)
      .set({ resultData: submitting })
      .where(and(job, isNull(jobs.resultData)))
      .returning({ id: jobs.id });
    if (reserved) return null;
    const [row] = await db.select({ receipt: jobs.resultData }).from(jobs).where(job);
    if (!row) throw new ServiceError('El trabajo de exportación no está activo.');
    const receipt = accepted.safeParse(row.receipt);
    if (!receipt.success) throw new UnknownRenderAdmissionError();
    return receipt.data.rendererJobId;
  },
  async accept(owner: string, webJobId: string, rendererJobId: string) {
    const [saved] = await db
      .update(jobs)
      .set({ resultData: accepted.parse({ phase: 'accepted', rendererJobId }) })
      .where(and(processingRender(owner, webJobId), eq(jobs.resultData, submitting)))
      .returning({ id: jobs.id });
    if (!saved) throw new ServiceError('No se pudo guardar el recibo de exportación.');
  },
};
