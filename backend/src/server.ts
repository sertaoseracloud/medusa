import 'dotenv/config';
import { loadSecrets } from './security/secrets.js';
import { createDb } from './persistence/db.js';
import { buildApp } from './app.js';

const secrets = loadSecrets(process.env);
const db = createDb(process.env.DATABASE_URL ?? '');
const app = await buildApp({ db, secrets });

const port = Number(process.env.PORT ?? 3333);

await app.listen({ port, host: '0.0.0.0' });
