/**
 * Usuário autônomo — LLM que age como um usuário real da Cleo.
 * Gera mensagens baseadas no contexto da conversa, sem script pré-definido.
 */

import type { AiClient } from './ai-client.js';
import type { Turn } from './simulator.js';

export interface Persona {
  name: string;
  phone: string;
  scenario: string;
  description: string;
}

const PERSONA_GENERATOR_PROMPT = `Você é um gerador de personas para testes de um CRM por WhatsApp chamado "Hi Cleo".
A Cleo é uma secretária virtual que atende clientes de pequenos negócios automaticamente.

Com base na documentação do produto abaixo, gere {count} personas DIVERSAS que representam
usuários reais do sistema. Cada persona deve ter um cenário diferente:

- Onboarding (dono configurando a Cleo pela primeira vez)
- Cliente mandando mensagem para negócio do dono
- Dono pedindo informações (leads, follow-ups)
- Situações edge-case (fora do horário, mensagens vagas, etc.)

DOCUMENTAÇÃO:
{docs}

Retorne APENAS um JSON array (sem markdown):
[
  {
    "name": "Nome Brasileiro",
    "scenario": "onboarding | client_message | owner_command | edge_case",
    "description": "Descrição curta de quem é e o que vai fazer na conversa"
  }
]`;

const USER_SYSTEM_PROMPT = `Você está simulando um usuário real de WhatsApp no Brasil.
Você é: {persona_description}

REGRAS:
- Escreva como uma pessoa REAL escreveria no WhatsApp (informal, abreviações, emojis às vezes)
- NÃO seja perfeito demais — gente real é vaga, manda msgs curtas, às vezes confusa
- Responda ao que a Cleo disse na última mensagem
- Tenha um OBJETIVO claro baseado no seu cenário
- Quando sentir que a conversa acabou naturalmente, responda apenas: [FIM]

CENÁRIO: {scenario}

HISTÓRICO DA CONVERSA ATÉ AGORA:
{history}

Gere APENAS a próxima mensagem do usuário (texto puro, sem aspas, sem "Usuário:"):`;

const FIRST_MESSAGE_PROMPT = `Você está simulando um usuário real de WhatsApp no Brasil.
Você é: {persona_description}

CENÁRIO: {scenario}

Gere a PRIMEIRA mensagem que esse usuário mandaria no WhatsApp.
Escreva como uma pessoa real (informal, curto, natural).

Se for onboarding: o usuário acabou de receber um código de ativação e vai mandá-lo.
Se for cliente: é a primeira vez que esse cliente manda msg pro negócio.
Se for dono: está pedindo algo pra Cleo.

Responda APENAS com a mensagem (texto puro, sem aspas):`;

/** Gera personas automaticamente a partir dos docs */
export async function generatePersonas(ai: AiClient, docs: string, count: number): Promise<Persona[]> {
  const prompt = PERSONA_GENERATOR_PROMPT
    .replace('{count}', String(count))
    .replace('{docs}', docs.slice(0, 6000)); // Limita pra não estourar contexto

  const response = await ai.generate(
    'Você gera dados de teste em JSON. Retorne APENAS JSON válido, sem markdown.',
    prompt,
  );

  // Extrai JSON da resposta (pode vir com ```json ... ``` ou <think>...</think>)
  let jsonStr = response
    .replace(/<think>[\s\S]*?<\/think>/g, '')  // Remove thinking tags (Qwen, etc.)
    .replace(/```json?\n?/g, '')
    .replace(/```/g, '')
    .trim();

  // Se ainda tem lixo antes do [, corta
  const arrayStart = jsonStr.indexOf('[');
  if (arrayStart > 0) jsonStr = jsonStr.slice(arrayStart);

  const personas = JSON.parse(jsonStr) as Array<{ name: string; scenario: string; description: string }>;

  // Atribui telefones fictícios únicos
  return personas.map((p, i) => ({
    ...p,
    phone: `5548999${String(100 + i).padStart(3, '0')}${String(1000 + i).slice(1)}`,
  }));
}

/** Gera a primeira mensagem do usuário */
export async function generateFirstMessage(
  ai: AiClient,
  persona: Persona,
  activationCode?: string,
): Promise<string> {
  // Se é onboarding e tem código, a primeira msg É o código
  if (persona.scenario === 'onboarding' && activationCode) {
    return activationCode;
  }

  const prompt = FIRST_MESSAGE_PROMPT
    .replace('{persona_description}', persona.description)
    .replace('{scenario}', persona.scenario);

  const response = await ai.generate('Gere apenas texto puro, sem aspas.', prompt);
  return response.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^(Usuário|Você|User):\s*/i, '').trim();
}

/** Gera a próxima mensagem do usuário baseada no histórico */
export async function generateNextMessage(
  ai: AiClient,
  persona: Persona,
  turns: Turn[],
): Promise<string | null> {
  const history = turns
    .map(t => `${t.role === 'user' ? 'Você' : 'Cleo'}: ${t.content}`)
    .join('\n');

  const prompt = USER_SYSTEM_PROMPT
    .replace('{persona_description}', persona.description)
    .replace('{scenario}', persona.scenario)
    .replace('{history}', history);

  const response = await ai.generate('Gere apenas texto puro, sem aspas nem prefixos.', prompt);

  // Se a LLM decidiu que a conversa acabou
  if (response.includes('[FIM]') || response.trim() === '') {
    return null;
  }

  // Limpa thinking tags e prefixos indesejados
  const cleaned = response
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^(Usuário|Você|User):\s*/i, '')
    .trim();

  return cleaned || null;
}
