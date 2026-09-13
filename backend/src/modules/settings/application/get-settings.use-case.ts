import type { SettingsRepositoryPort } from '../domain/ports.js';
import { toSettingsDto, type SettingsDto } from '../infrastructure/settings.dto.js';

export interface GetSettingsDeps {
  settings: SettingsRepositoryPort;
  masterKey: Buffer;
}

export function createGetSettingsUseCase(deps: GetSettingsDeps): {
  execute(userId: string): Promise<SettingsDto>;
} {
  return {
    async execute(userId: string): Promise<SettingsDto> {
      const record = await deps.settings.findByUserId(userId);
      return toSettingsDto(record, deps.masterKey);
    },
  };
}
