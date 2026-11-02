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
- NUNCA comece a mensagem com "/" (barra) — usuários de WhatsApp não enviam comandos assim
- Se a Cleo repetir a pergunta, é porque sua resposta anterior não serviu — responda DIRETAMENTE o que ela pediu, com outras palavras
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
      return 'Você recebeu uma mensagem da Cleo oferecendo o serviço (prospecção). Responda em UMA frase curta, como um ex-cliente: interesse ("me conta mais", "quanto custa?") OU desinteresse ("não tenho interesse", "para de mandar msg"). NUNCA pergunte à Cleo o que ela quer.';
    case 'material_flow':
      return 'Diga que vai enviar um documento/material para o cliente. Algo como "vou mandar o cardápio pro cliente" ou "preciso enviar o catálogo".';
    case 'local_classifier':
      return 'Mande APENAS uma saudação simples e curta: "oi", "bom dia", "boa tarde", "olá", "e aí". Nada além disso.';
    case 'configure_rules':
      return 'Peça para mudar alguma configuração. Exemplos: "muda meu horário pra 9 às 18", "quero que a Cleo responda mais formal", "pausa o atendimento hoje".';
    case 'disconnect_collaborator':
      return 'O dono quer remover o acesso de um colaborador. MANDE de cara o comando com o número completo do colaborador (ex: "desconecta 5548999887766" ou "pode tirar o acesso do 5548999887766").';
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
      return 'Você é o dono. Se a Cleo já respondeu o que você pediu, NÃO repita a pergunta: comente o resultado (ex: "boa, valeu") ou peça algo novo, e encerre com [FIM].';
    case 'edge_case':
      return 'Continue sendo imprevisível — mude de assunto, mande msgs curtas, teste limites.';
    case 'trial_flow':
      return 'Continue testando a Cleo — mande msgs de teste, pergunte funcionalidades, simule um cliente.';
    case 'invite_flow':
      return 'Se a Cleo pediu confirmação, confirme. Se deu certo, agradeça. Se pediu o número, forneça.';
    case 'prospection_response':
      return 'Continue a conversa sobre o serviço em frases curtas: pergunte o preço ou diga que não quer. Se já recebeu a resposta (link/confirmação), encerre com [FIM].';
    case 'material_flow':
      return 'Se a Cleo confirmou recebimento do material, peça para reenviar ou enviar para outro cliente. Se pediu detalhes, forneça.';
    case 'local_classifier':
      return 'Mande outra saudação simples ou encerre com [FIM] se já recebeu resposta.';
    case 'configure_rules':
      return 'Se a Cleo confirmou, encerre. Se pediu detalhes, forneça. Pode pedir outra mudança de config.';
    case 'disconnect_collaborator':
      return 'Se a Cleo confirmou a desconexão, agradeça e encerre com [FIM]. Se pediu confirmação, confirme ("isso, pode desconectar"). Se pediu o número, forneça o telefone completo.';
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

/** Mensagem de fallback por cenário, caso o persona LLM retorne vazio após retentativas */
function getFallbackFirstMessage(scenario: Scenario): string {
  switch (scenario) {
    case 'local_classifier':
      return 'bom dia';
    case 'edge_case':
      return 'oi 🙂';
    case 'client_message':
      return 'oi, quanto custa?';
    case 'owner_command':
      return 'como tá meu negócio hoje?';
    case 'disconnect_collaborator':
      return 'quero remover um colaborador';
    default:
      return 'oi';
  }
}

/**
 * Cenários em que a 1ª mensagem é um PEDIDO do dono. Neles, perguntar "você
 * quer…?" à Cleo é alucinação do modelo pequeno (vira um comando que o dono
 * nunca deu) — o E2E já mandou "/talvez você quer ver o status…".
 */
const FIRST_MESSAGE_MUST_BE_REQUEST: Scenario[] = [
  'owner_command', 'configure_rules', 'invite_flow', 'material_flow',
  'disconnect_collaborator', 'prospection_response',
];

/** Normaliza texto para comparar falas (sem acento, pontuação ou emoji). */
function normalizeForComparison(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Limpa o que modelo pequeno vaza na fala do usuário simulado: thinking tags,
 * prefixo de papel, aspas em volta e comentário meta depois da mensagem
 * ("Ah, já fiz a análise…"). Comando "/algo" não é removido aqui — ele é
 * rejeitado em `rejectReason` para o modelo ser corrigido, e não mascarado.
 */
export function cleanPersonaMessage(raw: string): string {
  const withoutTags = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^(Usuário|Usuária|Você|User|Cleo):\s*/i, '')
    .trim();

  const lines = withoutTags.split('\n').map((line) => line.trim()).filter(Boolean);
  // Mensagem de WhatsApp é curta: se a 1ª linha já é uma fala completa (4+
  // palavras), o resto é raciocínio do modelo e não faria parte da mensagem.
  const singleMessage = lines.length > 1 && lines[0].split(/\s+/).length >= 4
    ? lines[0]
    : withoutTags;

  return singleMessage
    .replace(/^["'“”](.*)["'“”]$/s, '$1')
    .trim();
}

/** Trecho de fala da Cleo considerado na detecção de eco. */
const ECHO_WINDOW = 40;

/** A persona repetiu/ecou a fala da Cleo em vez de falar como usuário. */
function isEchoOfCleo(message: string, lastCleoMessage?: string): boolean {
  if (!lastCleoMessage) return false;
  const msg = normalizeForComparison(message);
  const cleo = normalizeForComparison(lastCleoMessage);
  if (!msg || !cleo) return false;

  // Prefixo (comparação original) ou mensagem inteira contida na fala da Cleo
  if (msg.includes(cleo.slice(0, ECHO_WINDOW)) || cleo.includes(msg)) return true;

  // Eco "no meio" da fala: a persona cola uma FRASE da Cleo (ex.: a persona
  // repetiu "só de olho nos clientes que ainda não responderam" e a Cleo
  // executou a consulta de no_reply como se o usuário tivesse pedido).
  const fragments = lastCleoMessage
    .split(/[.!?\n]/)
    .map((fragment) => normalizeForComparison(fragment))
    .filter((fragment) => fragment.length >= 20);

  return fragments.some((fragment) => msg.includes(fragment));
}

/** A persona pergunta à Cleo o que ELA quer/precisa (inversão de papéis). */
const ASKS_THE_BOT = /\bvoc[eê]s?\s+(quer|querem|pode|podem|consegue|prefere|gostaria|vai|sabe)\b/i;

/** Fala dirigida ao bot (ex: se voce quer saber, me diz) — nao e mensagem de cliente/dono. */
const TALKS_TO_BOT = /\b(se|quando)\s+voc[eê]\s+(quer|quiser|precisar|souber)|\bme\s+(diz|diga|fala|conta)\s+(o|a|se|que)\b/i;

/** A persona falou como a Cleo (assistente), não como usuário. */
const ASSISTANT_VOICE = /\b(estou aqui para|posso (te )?ajudar|vou te ajudar|conte comigo|como posso ajudar|em que posso ajudar|quer que eu)\b/i;

/** Vazamento de raciocínio/meta-fala do modelo (não é mensagem de WhatsApp). */
const META_REASONING = /\b(an[aá]lise|analisando|vou responder|minha resposta|resposta da gente|como assistente|sou um (modelo|assistente)|usu[aá]rio simulado|j[aá] fiz|j[aá] vi|fazendo uma|aguarde)\b/i;

/** Similaridade (Jaccard) entre tokens significativos de duas falas. */
function similarity(a: string, b: string): { score: number; shared: number } {
  const tokens = (text: string) => new Set(normalizeForComparison(text).split(' ').filter((t) => t.length > 3));
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return { score: 0, shared: 0 };

  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;

  return { score: shared / (ta.size + tb.size - shared), shared };
}

interface PersonaMessageContext {
  /** Todas as falas anteriores do usuário simulado. */
  previousUserMessages?: string[];
  lastCleoMessage?: string;
  /** Só para a 1ª mensagem de cenários que exigem um pedido do dono. */
  forbidAskingBot?: boolean;
}

/**
 * Motivo pelo qual a mensagem do usuário simulado não serve (ou null se serve).
 * O motivo também alimenta o prompt de retry — repetir o mesmo prompt devolvia
 * o mesmo eco 3× com modelos pequenos e derrubava a conversa em 2 turnos.
 */
export function rejectReason(message: string, ctx: PersonaMessageContext = {}): string | null {
  if (!message) return 'retornou mensagem vazia';
  if (message.length > 240) return 'gerou uma mensagem longa demais para WhatsApp';

  const normalized = normalizeForComparison(message);
  const previous = ctx.previousUserMessages ?? [];

  // Comando "/algo" é coisa de bot: quem escreve no WhatsApp usa linguagem
  // natural (o modelo pequeno inventava "/troca_de_agenda" e "/talvez você quer…").
  if (message.startsWith('/')) {
    return 'mandou um comando "/algo" — usuário de WhatsApp escreve em linguagem natural';
  }

  // Repetir QUALQUER fala anterior já invalida: a conversa vira loop (o modelo
  // alternava duas variações da mesma pergunta e a Cleo respondia igual 5×).
  if (previous.some((prev) => normalizeForComparison(prev) === normalized)) {
    return 'repetiu uma mensagem que o usuário já mandou';
  }

  const lastUserMessage = previous.at(-1);
  if (lastUserMessage) {
    const { score, shared } = similarity(message, lastUserMessage);
    if (score >= 0.65 && shared >= 4) {
      return 'repetiu a mesma pergunta com outras palavras';
    }
  }

  if (isEchoOfCleo(message, ctx.lastCleoMessage)) {
    return 'ecoou a fala da Cleo';
  }
  if (META_REASONING.test(message)) {
    return 'vazou raciocínio/comentário meta em vez de uma mensagem de WhatsApp';
  }
  if (ASSISTANT_VOICE.test(message)) {
    return 'falou como a Cleo (assistente) em vez de falar como usuário';
  }
  if (ctx.forbidAskingBot && ASKS_THE_BOT.test(message)) {
    return 'perguntou o que a Cleo quer — quem pede é o usuário';
  }
  if (TALKS_TO_BOT.test(message)) {
    return 'falou como se estivesse atendendo a Cleo — escreva como cliente/dono';
  }

  return null;
}

const RETRY_FEEDBACK = (rejected: string, reason: string): string =>
  `\n\nSUA RESPOSTA ANTERIOR FOI REJEITADA: "${rejected.slice(0, 120)}"\n` +
  `MOTIVO: ${reason}.\n` +
  'Gere uma mensagem DIFERENTE, escrita pelo USUÁRIO (nunca pela Cleo), ' +
  'sem "/" no início e sem perguntar o que a Cleo quer. ' +
  'Se você já conseguiu o que queria, responda apenas [FIM].';

/**
 * Gera a PRIMEIRA mensagem do usuário, com retentativa caso o LLM retorne vazio
 * (qwen3:1.7b local frequentemente devolve só thinking-tag → string vazia) ou
 * uma fala inválida (eco da Cleo, comando "/algo", pergunta ao bot).
 * Se todas as tentativas falharem, usa uma mensagem de fallback do cenário —
 * um teste nunca deve morrer antes de começar por causa do simulador.
 */
export async function generateFirstMessage(
  ai: AiClient,
  persona: Persona,
  activationCode?: string,
): Promise<string> {
  // Se é onboarding ou trial_flow e tem código, a primeira msg É o código
  if ((persona.scenario === 'onboarding' || persona.scenario === 'trial_flow') && activationCode) {
    return activationCode;
  }

  const instructions = getFirstMessageInstructions(persona.scenario);

  const basePrompt = FIRST_MESSAGE_PROMPT
    .replace('{persona_description}', persona.description)
    .replace('{scenario}', persona.scenario)
    .replace('{first_message_instructions}', instructions);

  const forbidAskingBot = FIRST_MESSAGE_MUST_BE_REQUEST.includes(persona.scenario);

  let feedback = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await ai.generate(
      'Gere apenas texto puro, sem aspas.',
      feedback ? `${basePrompt}${feedback}` : basePrompt,
    );
    const cleaned = cleanPersonaMessage(response);
    const reason = rejectReason(cleaned, { forbidAskingBot });

    if (!reason) return cleaned;

    console.warn(`   ⚠️  Persona LLM ${reason} (tentativa ${attempt + 1}/3) — regenerando`);
    feedback = RETRY_FEEDBACK(response.trim(), reason);
  }

  const fallback = getFallbackFirstMessage(persona.scenario);
  console.warn(`   ⚠️  Usando mensagem de fallback para o cenário ${persona.scenario}: "${fallback}"`);
  return fallback;
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

  const previousUserMessages = turns
    .filter(t => t.role === 'user')
    .map(t => t.content.trim());
  // Última mensagem da Cleo — detecta "eco" (modelo pequeno repetindo a fala da
  // Cleo como se fosse do usuário, ex: responder a pergunta com a própria pergunta)
  const lastCleoMessage = [...turns].reverse().find(t => t.role !== 'user')?.content.trim();

  // qwen3 local às vezes devolve só thinking-tag → string vazia; retenta antes
  // de encerrar a conversa prematuramente. O retry leva o MOTIVO da rejeição:
  // reenviar o mesmo prompt devolvia o mesmo eco 3× e matava a conversa.
  let feedback = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await ai.generate(
      'Gere apenas texto puro, sem aspas nem prefixos.',
      feedback ? `${prompt}${feedback}` : prompt,
    );

    // Se a LLM decidiu que a conversa acabou
    if (response.includes('[FIM]')) return null;

    const cleaned = cleanPersonaMessage(response);
    const reason = rejectReason(cleaned, { previousUserMessages, lastCleoMessage });

    if (!reason) return cleaned;

    console.warn(`   ⚠️  Persona LLM ${reason} (tentativa ${attempt + 1}/3) — regenerando`);
    feedback = RETRY_FEEDBACK(response.trim(), reason);
  }

  // 3 tentativas esgotadas (vazia ou repetida) — encerra a conversa em vez de
  // alimentar um loop artificial que distorce o teste
  return null;
}
