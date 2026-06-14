import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const PASSWORD_SCHEME = 'scrypt';
const PASSWORD_KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');

  return `${PASSWORD_SCHEME}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedPassword: string): boolean {
  if (!isPasswordHashed(storedPassword)) {
    return storedPassword === password;
  }

  const [, salt, storedHash] = storedPassword.split('$');

  if (!salt || !storedHash) {
    return false;
  }

  const derivedKey = scryptSync(password, salt, PASSWORD_KEY_LENGTH);
  const storedHashBuffer = Buffer.from(storedHash, 'hex');

  if (storedHashBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedHashBuffer, derivedKey);
}

export function isPasswordHashed(password: string): boolean {
  const parts = password.split('$');
  return parts.length === 3 && parts[0] === PASSWORD_SCHEME;
}
