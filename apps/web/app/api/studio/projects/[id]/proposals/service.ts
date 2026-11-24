import { db } from '@/server/db';
import { ProposalService } from '@/server/services/studio/proposal-service';
export const proposals = new ProposalService(db);
