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
  getMessages,
  getProspectionStatus,
  getSessionStatusByUserId,
  markAsProspected,
  seedProspectedTrial,
  seedTestLead,
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
    case 'client_outside_hours':
    case 'trial_limit_reached':
    case 'client_unknown_question':
    case 'client_multi_request':
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
      const trialUserId = await createTestUser(persona.phone, persona.name, {
        onboardingComplete: true,
      });
      // Precisa existir linha em trial_attempts: é ela que o backend consulta
      // (prospection_status === 'contacted') para tratar a resposta do ex-prospect.
      await seedProspectedTrial(trialUserId, persona.phone, persona.name);
      await setTrialExpired(persona.phone);
      await markAsProspected(persona.phone);
      break;
    }

    case 'material_flow': {
      const ownerUserId = await createTestUser(persona.phone, persona.name, {
        plan: 'solo',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      // A persona cita o “aluno João”: o contato precisa existir, senão a Cleo
      // responde “não encontrei João” e o cenário não testa o reenvio.
      await seedTestLead(ownerUserId, 'João Silva', '5548988770001');
      await sendMaterial(persona.phone, 'catalogo-produtos.pdf', 'application/pdf');
      await sleep(2000);
      break;
    }

    case 'local_classifier': {
      // O cenário é um CLIENTE do negócio mandando “bom dia” — antes ele era
      // enviado como se fosse o DONO, então a Cleo respondia “quer ver os
      // clientes sem resposta?” (resposta de dono) e o cenário falhava por
      // testar o caminho errado.
      const ownerPhone = `55489990${persona.phone.slice(-5)}`;
      await cleanupPhone(ownerPhone);
      const userId = await createTestUser(ownerPhone, 'Dono Teste', {
        plan: 'solo',
        subscriptionStatus: 'active',
        onboardingComplete: true,
        servicesInfo: 'Corte masculino: R$ 40. Atende de seg a sáb, 9h às 19h.',
      });
      const ownerInstance = 'test-e2e';
      await createWhatsappSession(userId, ownerInstance);
      (persona as any)._ownerInstance = ownerInstance;
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
      (persona as any)._ownerPhone = ownerPhone;
      break;
    }

    case 'client_outside_hours':
    case 'client_unknown_question':
    case 'client_multi_request': {
      const ownerPhone = `55489990${persona.phone.slice(-5)}`;
      await cleanupPhone(ownerPhone);
      // Fora do horário de forma DETERMINÍSTICA: janela 03:00-04:00.
      const businessHours = persona.scenario === 'client_outside_hours'
        ? { start: '03:00', end: '04:00' }
        : undefined;
      const userId = await createTestUser(ownerPhone, 'Dono Teste', {
        plan: 'solo',
        subscriptionStatus: 'active',
        onboardingComplete: true,
        servicesInfo: 'Corte masculino: R$ 40. Atende de segunda a sábado, das 9h às 19h.',
        ...(businessHours ? { businessHours } : {}),
      });
      const ownerInstance = 'test-e2e';
      await createWhatsappSession(userId, ownerInstance);
      (persona as any)._ownerInstance = ownerInstance;
      (persona as any)._ownerPhone = ownerPhone;
      break;
    }

    case 'trial_limit_reached': {
      const ownerPhone = `55489990${persona.phone.slice(-5)}`;
      await cleanupPhone(ownerPhone);
      // Dono em trial que já usou todas as respostas automáticas.
      const userId = await createTestUser(ownerPhone, 'Dono Teste', {
        plan: 'solo',
        subscriptionStatus: 'trial',
        onboardingComplete: true,
        servicesInfo: 'Corte masculino: R$ 40.',
        trialResponses: { used: 30, limit: 30 },
      });
      const ownerInstance = 'test-e2e';
      await createWhatsappSession(userId, ownerInstance);
      (persona as any)._ownerInstance = ownerInstance;
      (persona as any)._ownerPhone = ownerPhone;
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

  const isClientScenario = [
    'client_message',
    'local_classifier',
    'client_outside_hours',
    'trial_limit_reached',
    'client_unknown_question',
    'client_multi_request',
  ].includes(persona.scenario);
  const ownerInstance = (persona as any)._ownerInstance as string | undefined;

  async function send(phone: string, text: string): Promise<void> {
    if (isClientScenario && ownerInstance) {
      await sendMessageAsClient(ownerInstance, phone, text, persona.name);
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

  // Cliente novo: o dono PRECISA ter recebido o aviso (a promessa nº 1 do
  // produto é “nunca deixar passar um cliente”). O aviso é persistido no
  // histórico do dono, então dá para verificar no banco.
  if (persona.scenario === 'client_message') {
    const ownerPhone = (persona as any)._ownerPhone as string | undefined;

    if (ownerPhone) {
      const doDono = await getMessages(ownerPhone, 20);
      const avisou = doDono.some((msg) => msg.content.includes('Novo cliente no WhatsApp'));

      if (!avisou) {
        verdict.problemas.push('Dono não foi avisado do cliente novo (aviso de lead ausente no histórico)');
        verdict.pass = false;
      } else {
        console.log('   ✅ [CHECK] Dono avisado do cliente novo');
        turns.push({ role: 'assistant', content: '[CHECK] Dono avisado do cliente novo', timestamp: new Date() });
      }
    }
  }

  const respostas = turns.filter((t) => t.role === 'assistant').map((t) => t.content);

  // Fora do horário: a resposta precisa indicar quando o negócio volta.
  if (persona.scenario === 'client_outside_hours') {
    const avisou = respostas.some((r) => /fora do hor[áa]rio|hor[áa]rio|amanh[ãa]|retorn/i.test(r));
    if (!avisou) {
      verdict.problemas.push('Cliente não foi avisado sobre o horário de retorno');
      verdict.pass = false;
    } else {
      console.log('   ✅ [CHECK] Cliente avisado do horário/retorno');
    }
  }

  // Trial no limite: a Cleo troca a IA por um aviso gracioso (não pode inventar).
  if (persona.scenario === 'trial_limit_reached') {
    const aviso = respostas.some((r) => /respons[áa]vel vai te responder/i.test(r));
    if (!aviso) {
      verdict.problemas.push('Cliente não recebeu o aviso gracioso de limite do trial');
      verdict.pass = false;
    } else {
      console.log('   ✅ [CHECK] Aviso de limite do trial enviado ao cliente');
    }
  }

  // Dois pedidos na mesma mensagem: preço E horário de sábado na resposta.
  if (persona.scenario === 'client_multi_request') {
    const texto = respostas.join(' ');
    const temPreco = /R\$\s?\d/.test(texto);
    const temSabado = /s[áa]bado/i.test(texto);
    if (!temPreco || !temSabado) {
      verdict.problemas.push(`Resposta incompleta para dois pedidos (preço: ${temPreco} | sábado: ${temSabado})`);
      verdict.pass = false;
    } else {
      console.log('   ✅ [CHECK] Respondeu preço e horário de sábado');
    }
  }

  // Pergunta fora do escopo: precisa responder algo (não deixar no vácuo).
  if (persona.scenario === 'client_unknown_question') {
    if (respostas.length === 0 || respostas.every((r) => !r.trim())) {
      verdict.problemas.push('Cliente ficou sem resposta para pergunta fora do escopo');
      verdict.pass = false;
    } else {
      console.log('   ✅ [CHECK] Cliente recebeu resposta para pergunta fora do escopo');
    }
  }

  // Prospecção: o backend precisa ter CLASSIFICADO a resposta (interessado ou
  // não). Sem isso o fluxo não rodou, mesmo que a conversa pareça boa.
  if (persona.scenario === 'prospection_response') {
    const status = await getProspectionStatus(persona.phone);
    const classified = status === 'interested' || status === 'not_interested';

    if (!classified) {
      verdict.problemas.push(`Resposta da prospecção não foi classificada (status: ${status ?? 'sem registro'})`);
      verdict.pass = false;
    } else {
      turns.push({ role: 'assistant', content: `[CHECK] Prospecção classificada como ${status}`, timestamp: new Date() });
    }
  }

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
