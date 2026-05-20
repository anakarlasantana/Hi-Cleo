import type { MessageJobData } from './queue.types.js';
import type { MessageProcessorPort } from './queue.port.js';
import type { Logger } from '../../shared/logger/logger.js';
import { truncate } from '../../shared/logger/logger.js';

export type MessageProcessor = MessageProcessorPort;

export function createMessageProcessor(container: any, logger: Logger): MessageProcessorPort {
  const log = logger.child({ module: 'processor' });

  return async (data: MessageJobData) => {
    const startTime = Date.now();
    const { phone, text, instance, isSecretaryInstance, pushName } = data;

    try {
      if (isSecretaryInstance) {
        await handleSecretaryMessage(container, phone, text);
      } else {
        await handleUserWhatsAppMessage(container, instance, phone, text, pushName);
      }

      const durationMs = Date.now() - startTime;
      log.info({ phone, instance, durationMs }, 'mensagem processada com sucesso');
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      log.error({ err: error, phone, instance, textIn: truncate(text), durationMs }, 'erro no processamento');

      // Se todos os providers de IA falharam, envia mensagem de fallback ao usuário
      if (error?.message === 'AI_ALL_PROVIDERS_FAILED') {
        try {
          await container.messaging.sendText({
            instance,
            to: phone,
            text: '⚠️ Estou com dificuldade pra processar agora. Vou te responder em breve!\n\nCaso esteja demorando, entre em contato com o suporte.',
          });
        } catch {
          // Se nem o envio funcionar, apenas loga
        }
      }

      throw error; // Re-throw para BullMQ acionar retry
    }
  };
}

async function handleSecretaryMessage(container: any, phone: string, text: string): Promise<void> {
  const { messaging, activationService, onboardingService, assistenteService, userRepo } = container;

  const activationMatch = text.match(/ATIVAR-[A-Z0-9]{4}/i);
  if (activationMatch) {
    const code = activationMatch[0].toUpperCase();
    const valid = await activationService.validateCode(code);

    if (!valid) {
      await messaging.sendText({ instance: 'secretary', to: phone, text: 'Código inválido ou expirado. Verifique o código e tente novamente.' });
      return;
    }

    const user = await activationService.activateUser(code, phone, text);
    await messaging.sendText({ instance: 'secretary', to: phone, text: `Bem-vindo(a)! 🎉\n\nSeu código foi ativado com sucesso!\n\nMe confirma: posso te chamar de *${user.nome}*?` });
    return;
  }

  const user = await userRepo.findByPhone(phone);
  if (!user) {
    await messaging.sendText({ instance: 'secretary', to: phone, text: 'Não encontrei seu cadastro. Se você já pagou, envie seu código de ativação (formato: ATIVAR-XXXX).' });
    return;
  }

  const onboardingComplete = await onboardingService.isComplete(user.id);
  if (!onboardingComplete) {
    const response = await onboardingService.processMessage(user.id, text);
    await messaging.sendText({ instance: 'secretary', to: phone, text: response });
    return;
  }

  const intent = await assistenteService.recognize(text);
  if (intent.confidence < 0.7) {
    await messaging.sendText({ instance: 'secretary', to: phone, text: 'Não entendi bem. Pode reformular? 🤔\n\nExemplos:\n• "quem tá sem resposta?"\n• "agenda retorno pro João amanhã"\n• "mostra meus clientes"' });
    return;
  }

  const response = await executeIntent(container, user, intent);
  await messaging.sendText({ instance: 'secretary', to: phone, text: response });
}

async function handleUserWhatsAppMessage(container: any, instance: string, phone: string, text: string, pushName?: string): Promise<void> {
  const { messaging, sessionRepo, userRepo, exclusionRepo, leadService, messageRepo, ruleEngine } = container;

  const session = await sessionRepo.findByInstance(instance);
  if (!session) return;

  const user = await userRepo.findById(session.user_id);
  if (!user) return;

  const isExcluded = await exclusionRepo.isExcluded(user.id, phone);
  if (isExcluded) return;

  const lead = await leadService.findOrCreate(user.id, phone, pushName);
  await messageRepo.save(lead.id, text, 'entrada');
  await leadService.updateLastInteraction(lead.id);

  const isNewLead = !lead.last_interaction;
  const autoResponse = await ruleEngine.evaluate({
    user, lead, isNewLead, messageText: text, timestamp: new Date(),
  });

  if (autoResponse) {
    await messaging.sendText({ instance, to: phone, text: autoResponse });
    await messageRepo.save(lead.id, autoResponse, 'saida');
  }
}

async function executeIntent(container: any, user: any, intent: { type: string; entities: Record<string, string> }): Promise<string> {
  const { leadService, exclusionRepo } = container;

  switch (intent.type) {
    case 'listar_leads': {
      const leads = await leadService.listByStatus(user.id, 'novo');
      if (leads.length === 0) return 'Você não tem clientes novos no momento. 📭';
      const list = leads.slice(0, 10).map((l: any, i: number) => `${i + 1}. *${l.nome}* (${l.telefone})`).join('\n');
      return `📋 Seus clientes:\n\n${list}`;
    }
    case 'leads_hoje': {
      const leads = await leadService.listToday(user.id);
      if (leads.length === 0) return 'Nenhum cliente novo hoje. 📭';
      const list = leads.map((l: any, i: number) => `${i + 1}. *${l.nome}*`).join('\n');
      return `📋 Clientes novos de hoje:\n\n${list}`;
    }
    case 'sem_resposta': {
      const leads = await leadService.listNoReply(user.id);
      if (leads.length === 0) return 'Todos os clientes estão com retorno em dia! ✅';
      const list = leads.slice(0, 10).map((l: any, i: number) => `${i + 1}. *${l.nome}* (${l.telefone})`).join('\n');
      return `⚠️ Clientes esperando retorno:\n\n${list}`;
    }
    case 'clientes_quentes': {
      const leads = await leadService.listByStatus(user.id, 'quente');
      if (leads.length === 0) return 'Nenhum cliente quente no momento.';
      const list = leads.slice(0, 10).map((l: any, i: number) => `${i + 1}. 🔥 *${l.nome}*`).join('\n');
      return `🔥 Clientes quentes:\n\n${list}`;
    }
    case 'ignorar_contato': {
      const nome = intent.entities.nome || '';
      const telefone = intent.entities.telefone || '';
      if (!nome && !telefone) return 'Qual contato você quer ignorar? Me diz o nome ou número.';
      await exclusionRepo.add(user.id, telefone || nome, nome);
      return `✅ Pronto! O contato *${nome || telefone}* foi marcado como pessoal.`;
    }
    case 'listar_ignorados': {
      const ignored = await exclusionRepo.list(user.id);
      if (ignored.length === 0) return 'Você não tem nenhum contato na lista de ignorados.';
      const list = ignored.map((c: any, i: number) => `${i + 1}. ${c.nome} (${c.telefone})`).join('\n');
      return `🚫 Contatos ignorados:\n\n${list}`;
    }
    case 'parar_ignorar': {
      const nome = intent.entities.nome || '';
      const telefone = intent.entities.telefone || '';
      if (!nome && !telefone) return 'Qual contato você quer voltar a acompanhar?';
      await exclusionRepo.remove(user.id, telefone || nome);
      return `✅ Voltei a acompanhar *${nome || telefone}*.`;
    }
    default:
      return 'Entendi o que você quer, mas essa função ainda está sendo preparada. Em breve! 🚧';
  }
}
