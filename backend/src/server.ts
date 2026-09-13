import 'dotenv/config';
import { loadSecrets } from './security/secrets.js';
import { createDb } from './persistence/db.js';
import { buildApp } from './app.js';
import { createUserRepository } from './modules/auth/infrastructure/user.repository.js';
import { seedOperatorUser } from './modules/auth/infrastructure/seed-user.js';

const secrets = loadSecrets(process.env);
const db = createDb(process.env.DATABASE_URL ?? '');
const app = await buildApp({ db, secrets });

const userRepository = createUserRepository(db);
await seedOperatorUser({ users: userRepository, env: process.env, log: app.log });

const port = Number(process.env.PORT ?? 3333);

await app.listen({ port, host: '0.0.0.0' });
