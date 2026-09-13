import 'dotenv/config';
import { loadSecrets } from './security/secrets.js';
import { createDb } from './persistence/db.js';
import { buildApp } from './app.js';
import { createUserRepository } from './modules/auth/infrastructure/user.repository.js';
import { seedOperatorUser } from './modules/auth/infrastructure/seed-user.js';
import { createSymbolsRepository } from './modules/symbols/infrastructure/symbols.repository.js';
import { registerBootSymbolSync } from './modules/symbols/infrastructure/boot-sync.js';
import { createSyncSymbolsUseCase } from './modules/symbols/application/sync-symbols.use-case.js';
import { getExchangeAdapter, DEFAULT_EXCHANGE_ID } from './exchanges/core/exchange-registry.js';

const secrets = loadSecrets(process.env);
const db = createDb(process.env.DATABASE_URL ?? '');
const app = await buildApp({ db, secrets });

const userRepository = createUserRepository(db);
await seedOperatorUser({ users: userRepository, env: process.env, log: app.log });

const symbolsRepository = createSymbolsRepository(db);
const syncSymbolsUseCase = createSyncSymbolsUseCase({
  db,
  symbols: symbolsRepository,
  adapter: getExchangeAdapter(DEFAULT_EXCHANGE_ID),
});
registerBootSymbolSync(app, { symbols: symbolsRepository, syncSymbols: syncSymbolsUseCase });

const port = Number(process.env.PORT ?? 3333);

await app.listen({ port, host: '0.0.0.0' });
