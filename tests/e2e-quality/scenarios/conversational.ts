/**
 * Cenários conversacionais — o autonomous-user (LLM) conversa com a Cleo
 * via webhook real e o judge avalia a qualidade da conversa.
 */

import type { AiClient } from '../ai-client.js';
import { config, type Scenario } from '../config.js';
import { generateFirstMessage, generateNextMessage, type Persona } from '../autonomous-user.js';
import { evaluateConversation } from '../judge.js';
import {
  cleanupPhone,
  createCollaborator,
  createTestUser,
  createWhatsappSession,
  getSessionStatusByUserId,
  markAsProspected,
  seedClientLeads,
  sendMaterial,
  sendMessage,
  sendMessageAsClient,
  setTrialExpired,
  startTrial,
  waitForResponse,
  type Turn,
} from '../simulator.js';
import type { ConversationResult } from '../types.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getMaxTurns(scenario: Scenario): number {
  switch (scenario) {
    case 'local_classifier':
      return 2;
    case 'disconnect_collaborator':
      return 3;
    case 'invite_flow':
    case 'configure_rules':
    case 'material_flow':
    case 'prospection_response':
      return 4;
    case 'trial_flow':
      return 6;
    default:
      return config.maxTurnsPerConversation;
  }
}

async function runConversation(personaAi: AiClient, judgeAi: AiClient, persona: Persona): Promise<ConversationResult> {
  const turns: Turn[] = [];

  await cleanupPhone(persona.phone);

  let activationCode: string | undefined;

  switch (persona.scenario) {
    case 'onboarding': {
      try {
        activationCode = await startTrial(persona.phone, persona.name);
      } catch {
        await cleanupPhone(persona.phone);
        await sleep(1000);
        activationCode = await startTrial(persona.phone, persona.name);
      }
      break;
    }

    case 'trial_flow': {
      try {
        activationCode = await startTrial(persona.phone, persona.name);
      } catch {
        await cleanupPhone(persona.phone);
        await sleep(1000);
        activationCode = await startTrial(persona.phone, persona.name);
      }
      break;
    }

    case 'invite_flow': {
      await createTestUser(persona.phone, persona.name, {
        plan: 'solo',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }

    case 'prospection_response': {
      await createTestUser(persona.phone, persona.name, {
        onboardingComplete: true,
      });
      await setTrialExpired(persona.phone);
      await markAsProspected(persona.phone);
      break;
    }

    case 'material_flow': {
      await createTestUser(persona.phone, persona.name, {
        plan: 'solo',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      await sendMaterial(persona.phone, 'catalogo-produtos.pdf', 'application/pdf');
      await sleep(2000);
      break;
    }

    case 'local_classifier': {
      await createTestUser(persona.phone, persona.name, {
        plan: 'solo',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }

    case 'configure_rules': {
      await createTestUser(persona.phone, persona.name, {
        plan: 'solo',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }

    case 'client_message': {
      const ownerPhone = `55489990${persona.phone.slice(-5)}`;
      await cleanupPhone(ownerPhone);
      const userId = await createTestUser(ownerPhone, 'Dono Teste', {
        plan: 'solo',
        subscriptionStatus: 'active',
        onboardingComplete: true,
        // Preço e horário de sábado configurados — a persona de cliente pergunta
        // exatamente isso, e a Cleo só pode responder se o dado existir.
        servicesInfo: 'Corte masculino: R$ 40. Atende aos sábados das 9h às 17h.',
      });
      const ownerInstance = 'test-e2e';
      await createWhatsappSession(userId, ownerInstance);
      (persona as any)._ownerInstance = ownerInstance;
      break;
    }

    case 'disconnect_collaborator': {
      const ownerUserId = await createTestUser(persona.phone, persona.name, {
        plan: 'equipe',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });

      // Colaborador já conectado ao mesmo owner — será desconectado via comando no chat
      const collaboratorPhone = `55489995${persona.phone.slice(-4)}`;
      await cleanupPhone(collaboratorPhone);
      const collaboratorId = await createCollaborator(ownerUserId, collaboratorPhone, 'Colaborador Teste', 'e2e-collab');
      (persona as any)._collaboratorId = collaboratorId;
      (persona as any)._collaboratorPhone = collaboratorPhone;
      break;
    }

    case 'owner_command':
    case 'edge_case': {
      const ownerUserId = await createTestUser(persona.phone, persona.name, {
        plan: 'solo',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      // O dono precisa de clientes de verdade para o cenário testar as listas
      // (senão a única "lead" é o próprio dono e a resposta não diz nada).
      if (persona.scenario === 'owner_command') {
        await seedClientLeads(ownerUserId);
      }
      break;
    }
  }

  const maxTurns = getMaxTurns(persona.scenario);

  const isClientScenario = persona.scenario === 'client_message';
  const ownerInstance = (persona as any)._ownerInstance as string | undefined;

  async function send(phone: string, text: string): Promise<void> {
    if (isClientScenario && ownerInstance) {
      await sendMessageAsClient(ownerInstance, phone, text);
    } else {
      await sendMessage(phone, text);
    }
  }

  // Primeira mensagem
  let firstMsg = await generateFirstMessage(personaAi, persona, activationCode);

  // Garante que o comando de desconexão use o telefone REAL do colaborador criado no setup
  if (persona.scenario === 'disconnect_collaborator') {
    const collaboratorPhone = (persona as any)._collaboratorPhone as string;
    firstMsg = `desconecta ${collaboratorPhone}`;
  }
  const beforeSend = new Date();
  await send(persona.phone, firstMsg);
  turns.push({ role: 'user', content: firstMsg, timestamp: beforeSend });

  await sleep(config.messageDelay);
  const firstResponse = await waitForResponse(persona.phone, beforeSend);
  if (firstResponse) {
    turns.push({ role: 'assistant', content: firstResponse, timestamp: new Date() });
  }

  // Loop de conversa
  for (let turn = 0; turn < maxTurns - 1; turn++) {
    const nextMsg = await generateNextMessage(personaAi, persona, turns);
    if (!nextMsg) break;

    const beforeNext = new Date();
    await send(persona.phone, nextMsg);
    turns.push({ role: 'user', content: nextMsg, timestamp: beforeNext });

    await sleep(config.messageDelay);
    const response = await waitForResponse(persona.phone, beforeNext);
    if (response) {
      turns.push({ role: 'assistant', content: response, timestamp: new Date() });
    } else {
      break;
    }
  }

  const verdict = await evaluateConversation(judgeAi, persona, turns, config.passThreshold);

  // Verificação determinística complementar (cenário híbrido): a sessão do
  // colaborador precisa estar desconectada no banco, independente do que a
  // Cleo disse no chat.
  if (persona.scenario === 'disconnect_collaborator') {
    const collaboratorId = (persona as any)._collaboratorId as string;
    const collaboratorPhone = (persona as any)._collaboratorPhone as string;
    const sessionStatus = await getSessionStatusByUserId(collaboratorId);
    if (sessionStatus !== 'disconnected') {
      verdict.pass = false;
      verdict.problemas.push(`Sessão do colaborador não foi desconectada (status atual: ${sessionStatus ?? 'inexistente'})`);
    } else {
      turns.push({ role: 'assistant', content: '[CHECK] Sessão do colaborador desconectada confirmada no banco', timestamp: new Date() });
    }
    await cleanupPhone(collaboratorPhone);
  }

  return { persona, turns, verdict };
}

export { runConversation };
