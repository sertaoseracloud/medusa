import argon2 from 'argon2';
import type { UserRepositoryPort, RefreshTokenRepositoryPort } from '../domain/ports.js';
import { InvalidCredentialsError } from '../domain/errors.js';
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
  generateRefreshToken,
  hashRefreshToken,
} from '../infrastructure/jwt.js';

// A precomputed argon2id hash of a random value — never matches any real
// password. Used to run a dummy verify when the email is unknown, so the
// login response timing does not disclose whether the account exists.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$BlsdRwMoOaAW/VC32EPdxg$9yU3Z6adhTp7xyT2PO2lPZjMJYpDjVpld5gJdW6Of5E';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: { id: string; email: string };
}

export interface LoginUseCaseDeps {
  users: UserRepositoryPort;
  refreshTokens: RefreshTokenRepositoryPort;
  signAccessToken: (payload: { sub: string }) => Promise<string> | string;
}

export function createLoginUseCase(deps: LoginUseCaseDeps) {
  const { users, refreshTokens, signAccessToken } = deps;

  return {
    async execute(input: LoginInput): Promise<LoginResult> {
      const { email, password } = input;
      const user = await users.findByEmail(email);

      if (!user) {
        // Run a dummy verify so timing does not reveal whether the email exists.
        await argon2.verify(DUMMY_HASH, password).catch(() => false);
        throw new InvalidCredentialsError();
      }

      const isValid = await argon2.verify(user.passwordHash, password);
      if (!isValid) {
        throw new InvalidCredentialsError();
      }

      const rawRefreshToken = generateRefreshToken();
      const tokenHash = hashRefreshToken(rawRefreshToken);
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
      await refreshTokens.insert(user.id, tokenHash, expiresAt);

      const accessToken = await signAccessToken({ sub: user.id });

      return {
        accessToken,
        refreshToken: rawRefreshToken,
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: user.id, email: user.email },
      };
    },
  };
}

export { ACCESS_TOKEN_TTL };
