import { compare, hash } from 'bcryptjs';

/**
 * bcrypt cost factor. 10 takes ~70ms on a modern laptop, slow enough to
 * make brute-forcing painful but fast enough that login feels instant.
 */
const BCRYPT_COST = 10;

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}
