import { compare } from 'bcryptjs';
import { hashPassword, verifyPassword as verifyScrypt } from 'better-auth/crypto';

export { hashPassword };

export function verifyPassword({ password, hash }: { password: string; hash: string }) {
  if (/^\$2[aby]\$/.test(hash)) return compare(password, hash);
  return verifyScrypt({ password, hash });
}
