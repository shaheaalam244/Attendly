import crypto from 'node:crypto';

const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'attendly-prod-grade-access-secret-key-2026';
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'attendly-prod-grade-refresh-secret-key-2026';

export interface TokenPayload {
  sub: string; // userId
  email: string;
  name: string;
  type: 'access' | 'refresh';
  jti: string;
  iat: number;
  exp: number;
}

/**
 * Password hashing using Node crypto.scryptSync with random 16-byte salt.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  let str = input.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4 !== 0) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

export function signJwt(
  payload: Omit<TokenPayload, 'iat' | 'exp' | 'jti'>,
  expiresInSeconds: number
): { token: string; jti: string; expiresAt: number } {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;
  const jti = crypto.randomUUID();
  const fullPayload: TokenPayload = { ...payload, jti, iat, exp };

  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(fullPayload)
  )}`;
  const secret = payload.type === 'access' ? ACCESS_SECRET : REFRESH_SECRET;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(unsigned)
    .digest();

  return {
    token: `${unsigned}.${base64UrlEncode(signature)}`,
    jti,
    expiresAt: exp * 1000,
  };
}

export function verifyJwt(
  token: string,
  expectedType: 'access' | 'refresh'
): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const unsigned = `${headerB64}.${payloadB64}`;
    const secret = expectedType === 'access' ? ACCESS_SECRET : REFRESH_SECRET;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', secret).update(unsigned).digest()
    );

    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(payloadB64)) as TokenPayload;
    if (payload.type !== expectedType) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSec) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashRefreshTokenId(jti: string): string {
  return crypto.createHash('sha256').update(jti).digest('hex');
}
