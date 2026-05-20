import { CronJob } from 'cron';
import type { MessagingPort, ConnectionStatus } from '../evolution/evolution.port.js';
import type { Logger } from '../../shared/logger/logger.js';

export interface ConnectionMonitorDeps {
  messaging: MessagingPort;
  logger: Logger;
  instanceName: string;
  adminPhone?: string;
}

export interface ConnectionMonitorState {
  lastKnownStatus: ConnectionStatus | null;
  isFirstCheck: boolean;
}

export function checkConnection(
  deps: ConnectionMonitorDeps,
  state: ConnectionMonitorState,
  currentStatus: ConnectionStatus
): { newState: ConnectionMonitorState; alert?: string } {
  const { instanceName } = deps;
  const timestamp = new Date().toLocaleString('pt-BR');

  // Primeira verificação: registrar estado sem alertar
  if (state.isFirstCheck) {
    return {
      newState: { lastKnownStatus: currentStatus, isFirstCheck: false },
    };
  }

  const prev = state.lastKnownStatus;

  // Transição para desconectado
  if (prev === 'open' && (currentStatus === 'close' || currentStatus === 'connecting')) {
    return {
      newState: { lastKnownStatus: currentStatus, isFirstCheck: false },
      alert: `⚠️ *ALERTA:* A instância "${instanceName}" desconectou do WhatsApp às ${timestamp}. Verifique a conexão.`,
    };
  }

  // Transição para reconectado
  if ((prev === 'close' || prev === 'connecting') && currentStatus === 'open') {
    return {
      newState: { lastKnownStatus: currentStatus, isFirstCheck: false },
      alert: `✅ *RECUPERADO:* A instância "${instanceName}" reconectou ao WhatsApp às ${timestamp}.`,
    };
  }

  // Sem mudança relevante
  return {
    newState: { lastKnownStatus: currentStatus, isFirstCheck: false },
  };
}

export function startConnectionMonitor(deps: ConnectionMonitorDeps): CronJob {
  const { messaging, logger, instanceName, adminPhone } = deps;
  const log = logger.child({ module: 'monitor', instance: instanceName });

  let state: ConnectionMonitorState = { lastKnownStatus: null, isFirstCheck: true };

  const job = new CronJob('*/5 * * * *', async () => {
    const startTime = Date.now();

    try {
      const currentStatus = await messaging.getStatus(instanceName);
      const result = checkConnection(deps, state, currentStatus);

      log.info(
        { previousState: state.lastKnownStatus, currentState: currentStatus, durationMs: Date.now() - startTime },
        'verificação de conexão'
      );

      state = result.newState;

      if (result.alert && adminPhone) {
        await messaging.sendText({ instance: instanceName, to: adminPhone, text: result.alert });
        log.warn({ alert: result.alert }, 'alerta de conexão enviado');
      }
    } catch (error) {
      log.error({ err: error, durationMs: Date.now() - startTime }, 'falha ao verificar conexão');
      // Não altera estado em caso de erro — tenta no próximo ciclo
    }
  });

  job.start();

  // Verificação imediata na inicialização
  (async () => {
    try {
      const currentStatus = await messaging.getStatus(instanceName);
      state = { lastKnownStatus: currentStatus, isFirstCheck: false };
      log.info({ status: currentStatus }, 'monitor iniciado — estado inicial registrado');
    } catch (error) {
      log.error({ err: error }, 'falha na verificação inicial');
    }
  })();

  return job;
}
