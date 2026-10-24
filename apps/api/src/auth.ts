import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { DomainError, UUID_PATTERN } from '@suite/core';

export interface AuthConfig {
  issuer: string;
  audience: string;
  jwksUrl?: string;
  secret?: string;
}
export type VerifyIdentity = (authorization: string | undefined) => Promise<string>;
export function authConfig(environment: NodeJS.ProcessEnv): AuthConfig {
  const issuer = environment.AUTH_ISSUER;
  const audience = environment.AUTH_AUDIENCE;
  const jwksUrl = environment.AUTH_JWKS_URL;
  const secret = environment.AUTH_JWT_SECRET;
  if (!issuer || !audience || Boolean(jwksUrl) === Boolean(secret)) {
    throw new Error(
      'Set AUTH_ISSUER, AUTH_AUDIENCE and exactly one of AUTH_JWKS_URL / AUTH_JWT_SECRET. Production never falls back to demo.',
    );
  }
  return { issuer, audience, ...(jwksUrl ? { jwksUrl } : { secret: secret! }) };
}
export function createJwtVerifier(config: AuthConfig): VerifyIdentity {
  if (!config.issuer || !config.audience || Boolean(config.jwksUrl) === Boolean(config.secret)) {
    throw new Error('Complete JWT configuration is required.');
  }
  let key: Uint8Array | JWTVerifyGetKey;
  let algorithms: string[];
  if (config.jwksUrl) {
    const url = new URL(config.jwksUrl);
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    ) {
      throw new Error(
        'JWKS requires HTTPS (HTTP is permitted only for explicit loopback development).',
      );
    }
    key = createRemoteJWKSet(url, { timeoutDuration: 5_000, cooldownDuration: 30_000 });
    algorithms = ['RS256', 'ES256', 'EdDSA'];
  } else {
    key = new TextEncoder().encode(config.secret);
    if (key.byteLength < 32) throw new Error('AUTH_JWT_SECRET must contain at least 32 bytes.');
    algorithms = ['HS256'];
  }
  return async (authorization) => {
    if (!authorization || !/^Bearer \S+$/i.test(authorization)) {
      throw new DomainError(401, 'UNAUTHENTICATED', 'A verified sign-in is required.');
    }
    try {
      const token = authorization.slice(7);
      const options = {
        issuer: config.issuer,
        audience: config.audience,
        algorithms,
        requiredClaims: ['sub', 'exp'],
      };
      const verified =
        typeof key === 'function'
          ? await jwtVerify(token, key, options)
          : await jwtVerify(token, key, options);
      if (!verified.payload.sub || !UUID_PATTERN.test(verified.payload.sub))
        throw new Error('Invalid subject.');
      // Token role/app_metadata claims are deliberately not authorization grants.
      return verified.payload.sub.toLowerCase();
    } catch {
      throw new DomainError(
        401,
        'UNAUTHENTICATED',
        'The sign-in token is missing, invalid or expired.',
      );
    }
  };
}
