import type { MessagingPort } from './evolution.port.js';
import type { Logger } from '../../shared/logger/logger.js';

export interface EvolutionSetupDeps {
  messaging: MessagingPort;
  logger: Logger;
  instanceName: string;
  webhookUrl: string;
}

const SETUP_RETRY_DELAY_MS = 5000;
const SETUP_MAX_RETRIES = 10;

/**
 * Garante que a instância da Evolution API existe e está com webhook configurado.
 * Roda no startup do backend — se a instância já existe, apenas valida.
 * Se não existe, cria com webhook pré-configurado.
 */
export async function ensureEvolutionInstance(deps: EvolutionSetupDeps): Promise<void> {
  const { messaging, logger, instanceName, webhookUrl } = deps;
  const log = logger.child({ module: 'evolution-setup', instance: instanceName });

  for (let attempt = 1; attempt <= SETUP_MAX_RETRIES; attempt++) {
    try {
      const status = await messaging.getStatus(instanceName);
      log.info({ status }, 'instância já existe');
      return;
    } catch (error: any) {
      const isNotFound = error?.response?.status === 404 || error?.response?.status === 400;

      if (isNotFound) {
        log.info('instância não encontrada — criando...');
        try {
          await messaging.createInstance({
            name: instanceName,
            webhookUrl,
            webhookEvents: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          });
          log.info('instância criada com webhook configurado');
          return;
        } catch (createError) {
          log.error({ err: createError }, 'falha ao criar instância');
          throw createError;
        }
      }

      // Evolution API pode não estar pronta ainda (container subindo)
      if (attempt < SETUP_MAX_RETRIES) {
        log.warn({ attempt, maxRetries: SETUP_MAX_RETRIES }, 'Evolution API indisponível — tentando novamente...');
        await delay(SETUP_RETRY_DELAY_MS);
      } else {
        log.error({ err: error }, 'Evolution API indisponível após todas as tentativas');
        throw error;
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
