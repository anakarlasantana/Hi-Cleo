import { CronJob } from 'cron';
import type { MessagingPort, ConnectionStatus } from '../evolution/evolution.port.js';
import type { Logger } from '../../shared/logger/logger.js';
import type { SessionRepository } from '../webhooks/webhooks.port.js';

export interface ConnectionMonitorDeps {
  messaging: MessagingPort;
  logger: Logger;
  instanceName: string;
  adminPhone?: string;
  sessionRepo?: SessionRepository;
  userRepo?: { findById(id: string): Promise<{ id: string; phone: string | null; name: string | null } | null> };
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
      // 1. Verificar instância principal (secretária)
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

      // 2. Verificar sessões dos usuários e notificar se desconectaram
      if (deps.sessionRepo && deps.userRepo) {
        await checkUserSessions(deps, log);
      }
    } catch (error) {
      log.error({ err: error, durationMs: Date.now() - startTime }, 'falha ao verificar conexão');
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

/**
 * Verifica todas as sessões ativas dos usuários.
 * Se alguma desconectou, notifica o usuário via WhatsApp (instância da secretária)
 * e marca a sessão como desconectada no banco.
 */
async function checkUserSessions(deps: ConnectionMonitorDeps, log: any): Promise<void> {
  const { messaging, instanceName, sessionRepo, userRepo } = deps;
  if (!sessionRepo || !userRepo) return;

  const activeSessions = await sessionRepo.listActiveSessions();

  for (const session of activeSessions) {
    try {
      const status = await messaging.getStatus(session.instance_name);

      if (status === 'close') {
        // Sessão desconectou — notificar o usuário e marcar no banco
        const user = await userRepo.findById(session.user_id);
        if (!user || !user.phone) continue;

        await sessionRepo.markDisconnected(session.instance_name);

        await messaging.sendText({
          instance: instanceName,
          to: user.phone,
          text: `⚠️ *Atenção, ${user.name || 'parceiro(a)'}!*\n\nSua conexão com o WhatsApp caiu. Enquanto estiver desconectado(a), não consigo receber as mensagens dos seus clientes.\n\nNossa equipe já está ciente e trabalhando nisso. Se demorar, você pode reconectar manualmente pelo link:\n\n🔗 ${process.env.SITE_URL || ''}/conectar\n\nSe precisar de ajuda, entre em contato com o suporte. 🙏`,
        });

        log.warn({ userId: session.user_id, instance: session.instance_name }, 'sessão de usuário desconectada — notificação enviada');
      }
    } catch (error) {
      log.error({ err: error, instance: session.instance_name }, 'erro ao verificar sessão de usuário');
    }
  }
}
