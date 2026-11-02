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
    } catch (error: any) {
      // Mesmo cuidado do loop de sessões: erro HTTP da Evolution vira log
      // compacto (status + message) em vez do AxiosError inteiro a cada ciclo.
      const status = error?.response?.status;
      if (typeof status === 'number') {
        log.error({ status, message: error?.message, durationMs: Date.now() - startTime }, 'falha ao verificar conexão');
      } else {
        log.error({ err: error, durationMs: Date.now() - startTime }, 'falha ao verificar conexão');
      }
    }
  });

  job.start();

  // Verificação imediata na inicialização
  (async () => {
    try {
      const currentStatus = await messaging.getStatus(instanceName);
      state = { lastKnownStatus: currentStatus, isFirstCheck: false };
      log.info({ status: currentStatus }, 'monitor iniciado — estado inicial registrado');
    } catch (error: any) {
      const status = error?.response?.status;
      if (typeof status === 'number') {
        log.error({ status, message: error?.message }, 'falha na verificação inicial');
      } else {
        log.error({ err: error }, 'falha na verificação inicial');
      }
    }
  })();

  return job;
}

/**
 * Verifica UMA sessão ativa e reage ao status.
 *
 * Exportada para teste: sessão cuja instância não existe mais na Evolution
 * (404/400) deve ser marcada como desconectada e logada em `warn` — antes caía
 * em `log.error({ err })`, despejando o AxiosError inteiro a cada 5 minutos.
 */
export async function checkUserSession(
  deps: ConnectionMonitorDeps,
  log: any,
  session: { user_id: string; instance_name: string },
): Promise<void> {
  const { messaging, instanceName, sessionRepo, userRepo } = deps;
  if (!sessionRepo || !userRepo) return;

  try {
    const status = await messaging.getStatus(session.instance_name);

    if (status !== 'close') return;

    // Sessão desconectou — notificar o usuário e marcar no banco
    const user = await userRepo.findById(session.user_id);
    if (!user || !user.phone) return;

    await sessionRepo.markDisconnected(session.instance_name);

    await messaging.sendText({
      instance: instanceName,
      to: user.phone,
      text: `⚠️ *Atenção, ${user.name || 'parceiro(a)'}!*\n\nSua conexão com o WhatsApp caiu. Enquanto estiver desconectado(a), não consigo receber as mensagens dos seus clientes.\n\nNossa equipe já está ciente e trabalhando nisso. Se demorar, você pode reconectar manualmente pelo link:\n\n🔗 ${process.env.SITE_URL || ''}/conectar\n\nSe precisar de ajuda, entre em contato com o suporte. 🙏`,
    });

    log.warn({ userId: session.user_id, instance: session.instance_name }, 'sessão de usuário desconectada — notificação enviada');
  } catch (error: any) {
    const status = error?.response?.status;

    // 404/400 = a instância não existe (mais) na Evolution — caso típico de
    // sessão órfã de teste (instance_name 'test-e2e') ou de conexão removida
    // por fora. Não é falha do monitor: marca como desconectada e loga compacto.
    if (status === 404 || status === 400) {
      try {
        await sessionRepo.markDisconnected(session.instance_name);
      } catch { /* melhor esforço: o log abaixo já sinaliza o problema */ }

      log.warn(
        { instance: session.instance_name, status },
        'instância não existe na Evolution — sessão marcada como desconectada',
      );
      return;
    }

    // Erro de rede/5xx: mantém o stack (err), mas sem o dump gigante do axios
    if (typeof status === 'number') {
      log.error({ instance: session.instance_name, status }, 'erro ao verificar sessão de usuário');
    } else {
      log.error({ err: error, instance: session.instance_name }, 'erro ao verificar sessão de usuário');
    }
  }
}

/**
 * Verifica todas as sessões ativas dos usuários.
 * Se alguma desconectou, notifica o usuário via WhatsApp (instância da secretária)
 * e marca a sessão como desconectada no banco.
 */
async function checkUserSessions(deps: ConnectionMonitorDeps, log: any): Promise<void> {
  const { sessionRepo, userRepo } = deps;
  if (!sessionRepo || !userRepo) return;

  const activeSessions = await sessionRepo.listActiveSessions();

  for (const session of activeSessions) {
    await checkUserSession(deps, log, session);
  }
}
