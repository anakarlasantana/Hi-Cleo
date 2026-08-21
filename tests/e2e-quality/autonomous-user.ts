/**
 * Usuário autônomo — LLM que age como um usuário real da Cleo.
 * Gera mensagens baseadas no contexto da conversa, sem script pré-definido.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AiClient } from './ai-client.js';
import type { Turn } from './simulator.js';
import { config, type Scenario } from './config.js';

const __dirname = typeof import.meta.dirname === 'string'
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));

/**
 * Carrega personas pré-geradas de um arquivo JSON local.
 * Permite rodar os testes sem precisar gerar personas via IA (mais rápido, sem timeout).
 * Gere o arquivo com: E2E_PERSONA_PROVIDER=deepseek npx tsx tests/e2e-quality/generate-personas.ts
 */
function loadPregeneratedPersonas(count: number): Persona[] | null {
  try {
    const filePath = resolve(__dirname, 'personas.json');
    const content = readFileSync(filePath, 'utf-8');
    const personas = JSON.parse(content) as Array<{ name: string; scenario: string; description: string; phone?: string }>;

    // Pega a quantidade solicitada (ou todas se menos que count)
    return personas.slice(0, count).map((p, i) => ({
      name: p.name,
      scenario: p.scenario as Scenario,
      description: p.description,
      phone: p.phone || `5548999${String(100 + i).padStart(3, '0')}${String(1000 + i).slice(1)}`,
    }));
  } catch {
    // Arquivo não existe — vai gerar via IA
    return null;
  }
}

export interface Persona {
  name: string;
  phone: string;
  scenario: Scenario;
  description: string;
}

const PERSONA_GENERATOR_PROMPT = `Você é um gerador de personas para testes de um CRM por WhatsApp chamado "Hi Cleo".
A Cleo é uma secretária virtual que atende clientes de pequenos negócios automaticamente.

Com base na documentação do produto abaixo, gere {count} personas DIVERSAS que representam
usuários reais do sistema. Cada persona deve ter um cenário diferente:

- onboarding: dono configurando a Cleo pela primeira vez (ativação + coleta de dados)
- client_message: cliente mandando mensagem para negócio do dono
- owner_command: dono pedindo informações (leads, follow-ups, status)
- edge_case: situações limítrofes (fora do horário, mensagens vagas, spam)
- trial_flow: dono que acabou de iniciar trial e está testando a Cleo
- invite_flow: dono que quer adicionar um colaborador para acessar a secretária
- prospection_response: ex-trial que recebeu mensagem de prospecção da Cleo e está respondendo
- material_flow: dono que quer enviar material (PDF, catálogo) para cliente
- local_classifier: cliente que só manda saudações simples (oi, bom dia, tudo bem)
- configure_rules: dono querendo mudar configurações (horário de atendimento, tom de voz, regras)

NÃO gere personas para: payment_webhook, degraded_fallback (são testes técnicos automáticos).

DOCUMENTAÇÃO:
{docs}

Retorne APENAS um JSON array (sem markdown):
[
  {
    "name": "Nome Brasileiro",
    "scenario": "onboarding | client_message | owner_command | edge_case | trial_flow | invite_flow | prospection_response | material_flow | local_classifier | configure_rules",
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

INSTRUÇÕES ESPECÍFICAS DO CENÁRIO:
{scenario_instructions}

HISTÓRICO DA CONVERSA ATÉ AGORA:
{history}

Gere APENAS a próxima mensagem do usuário (texto puro, sem aspas, sem "Usuário:"):`;

const FIRST_MESSAGE_PROMPT = `Você está simulando um usuário real de WhatsApp no Brasil.
Você é: {persona_description}

CENÁRIO: {scenario}

INSTRUÇÕES:
{first_message_instructions}

Gere a PRIMEIRA mensagem que esse usuário mandaria no WhatsApp.
Escreva como uma pessoa real (informal, curto, natural).

Responda APENAS com a mensagem (texto puro, sem aspas):`;

/** Instruções específicas de primeira mensagem por cenário */
function getFirstMessageInstructions(scenario: Scenario): string {
  switch (scenario) {
    case 'onboarding':
      return 'O usuário acabou de receber um código de ativação e vai mandá-lo.';
    case 'client_message':
      return 'É a primeira vez que esse cliente manda mensagem pro negócio. Pergunte sobre preço, horário, disponibilidade ou serviço.';
    case 'owner_command':
      return 'O dono está pedindo algo pra Cleo — listar leads, ver agenda, status, etc.';
    case 'edge_case':
      return 'Mande algo inesperado — emoji solto, mensagem vaga, pergunta sem contexto, ou algo fora do horário.';
    case 'trial_flow':
      return 'O dono acabou de ativar o trial e vai testar a Cleo. Pode mandar uma mensagem de teste ou perguntar como funciona.';
    case 'invite_flow':
      return 'O dono quer convidar um colaborador. Mande algo como "convida 5548999887766" ou "quero adicionar meu atendente".';
    case 'prospection_response':
      return 'Você recebeu uma mensagem da Cleo oferecendo o serviço (prospecção). Responda com interesse ("me conta mais", "quanto custa") OU desinteresse ("não tenho interesse", "para de mandar msg").';
    case 'material_flow':
      return 'Diga que vai enviar um documento/material para o cliente. Algo como "vou mandar o cardápio pro cliente" ou "preciso enviar o catálogo".';
    case 'local_classifier':
      return 'Mande APENAS uma saudação simples e curta: "oi", "bom dia", "boa tarde", "olá", "e aí". Nada além disso.';
    case 'configure_rules':
      return 'Peça para mudar alguma configuração. Exemplos: "muda meu horário pra 9 às 18", "quero que a Cleo responda mais formal", "pausa o atendimento hoje".';
    default:
      return 'Gere uma mensagem natural e curta.';
  }
}

/** Instruções de continuação por cenário (para o prompt do user autônomo) */
function getScenarioInstructions(scenario: Scenario): string {
  switch (scenario) {
    case 'onboarding':
      return 'Continue o fluxo de onboarding — responda as perguntas da Cleo sobre seu negócio naturalmente.';
    case 'client_message':
      return 'Você é cliente. Continue perguntando sobre o serviço/produto ou agradeça e encerre.';
    case 'owner_command':
      return 'Você é o dono. Peça mais detalhes, faça outro comando, ou encerre quando obtiver o que precisava.';
    case 'edge_case':
      return 'Continue sendo imprevisível — mude de assunto, mande msgs curtas, teste limites.';
    case 'trial_flow':
      return 'Continue testando a Cleo — mande msgs de teste, pergunte funcionalidades, simule um cliente.';
    case 'invite_flow':
      return 'Se a Cleo pediu confirmação, confirme. Se deu certo, agradeça. Se pediu o número, forneça.';
    case 'prospection_response':
      return 'Continue a conversa sobre o serviço. Pergunte preço, como funciona, ou diga que não quer.';
    case 'material_flow':
      return 'Se a Cleo confirmou recebimento do material, peça para reenviar ou enviar para outro cliente. Se pediu detalhes, forneça.';
    case 'local_classifier':
      return 'Mande outra saudação simples ou encerre com [FIM] se já recebeu resposta.';
    case 'configure_rules':
      return 'Se a Cleo confirmou, encerre. Se pediu detalhes, forneça. Pode pedir outra mudança de config.';
    default:
      return 'Continue a conversa naturalmente.';
  }
}

/** Gera personas automaticamente a partir dos docs */
export async function generatePersonas(ai: AiClient, docs: string, count: number): Promise<Persona[]> {
  // Tenta carregar personas pré-geradas (mais rápido, sem IA)
  const pregenerated = loadPregeneratedPersonas(count);
  if (pregenerated) {
    console.log('   📦 Usando personas pré-geradas (tests/e2e-quality/personas.json)');
    return pregenerated;
  }

  // Ollama local: contexto menor para não estourar timeout em CPU
  // APIs externas podem receber mais contexto
  const maxDocsLength = config.personaProvider === 'ollama' ? 1500 : 6000;

  const prompt = PERSONA_GENERATOR_PROMPT
    .replace('{count}', String(count))
    .replace('{docs}', docs.slice(0, maxDocsLength));

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
    scenario: p.scenario as Scenario,
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

  const instructions = getFirstMessageInstructions(persona.scenario);

  const prompt = FIRST_MESSAGE_PROMPT
    .replace('{persona_description}', persona.description)
    .replace('{scenario}', persona.scenario)
    .replace('{first_message_instructions}', instructions);

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

  const scenarioInstructions = getScenarioInstructions(persona.scenario);

  const prompt = USER_SYSTEM_PROMPT
    .replace('{persona_description}', persona.description)
    .replace('{scenario}', persona.scenario)
    .replace('{scenario_instructions}', scenarioInstructions)
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
