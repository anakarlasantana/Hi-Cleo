import type { AiPort } from '../../../shared/ports/ai.port.js';
import type { IntentType, RecognizedIntent } from '../../../shared/types/index.js';
import { sanitizeForAiPrompt } from '../../../shared/middleware/sanitize.js';
import { INTENT_PROMPT } from '../prompts/intent.prompts.js';

/** Todas as intenções válidas — usado para validar o que a IA devolve. */
const VALID_INTENTS: IntentType[] = [
  'list_leads', 'leads_today', 'no_reply', 'hot_leads', 'schedule_followup',
  'lead_status', 'send_material', 'configure_rule', 'ignore_contact',
  'list_ignored', 'stop_ignoring', 'invite_user', 'disconnect_user', 'help', 'unknown',
];

/**
 * Intenções que só fazem sentido isoladas: pedem dados complementares ao usuário
 * (nome do contato, número, material). Em multi-intent elas interrompem o fluxo,
 * então são executadas por último e não bloqueiam as consultas.
 */
export const ASKING_INTENTS: IntentType[] = [
  'schedule_followup', 'send_material', 'ignore_contact', 'stop_ignoring',
  'invite_user', 'disconnect_user', 'configure_rule',
];

/**
 * Intenções de consulta: seguras para executar em sequência e combinar numa
 * única resposta ("clientes de hoje" + "quem está sem resposta").
 */
const QUERY_INTENTS: IntentType[] = ['list_leads', 'leads_today', 'no_reply', 'hot_leads', 'lead_status', 'list_ignored'];

function isValidIntent(type: unknown): type is IntentType {
  return typeof type === 'string' && (VALID_INTENTS as string[]).includes(type);
}

/**
 * Normaliza a lista de pedidos: remove inválidos, duplicados, `unknown` e
 * intenções que pedem dados mas aparecem repetidas. Preserva a ordem.
 */
export function normalizeAdditionalIntents(
  primary: IntentType,
  raw: unknown,
): Array<{ type: IntentType; entities: Record<string, string>; originalText?: string }> {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<IntentType>([primary]);
  const result: Array<{ type: IntentType; entities: Record<string, string>; originalText?: string }> = [];

  for (const item of raw) {
    const type = typeof item === 'string' ? item : (item as any)?.type;
    if (!isValidIntent(type)) continue;
    if (type === 'unknown') continue;
    if (seen.has(type)) continue;

    seen.add(type);
    const entities = (typeof item === 'object' && item?.entities && typeof item.entities === 'object')
      ? item.entities as Record<string, string>
      : {};

    result.push({ type, entities });
  }

  return result;
}

/**
 * Ordena os pedidos para execução: consultas primeiro (podem ser combinadas
 * numa resposta só), depois as que perguntam dados ao usuário.
 */
export function orderIntentsForExecution(intents: Array<{ type: IntentType }>): Array<{ type: IntentType }> {
  const isQuery = (t: IntentType) => QUERY_INTENTS.includes(t);
  return [...intents].sort((a, b) => Number(!isQuery(a.type)) - Number(!isQuery(b.type)));
}

/**
 * Reconhece a intenção do dono a partir de texto (ou áudio transcrito).
 * Função pura: recebe IA + texto → retorna intent tipado.
 *
 * Suporta MÚLTIPLOS pedidos na mesma mensagem: o primeiro vem em `type` e os
 * demais em `additionalIntents` (ex: "clientes novos de hoje e quem está sem
 * resposta"). Antes, só o primeiro era executado e a Cleo ignorava o resto.
 *
 * No LangGraph futuro, será o nó router do grafo de assistente.
 */
export async function recognizeIntent(ai: AiPort, text: string): Promise<RecognizedIntent> {
  try {
    const sanitized = sanitizeForAiPrompt(text);

    const response = await ai.generateContent([
      INTENT_PROMPT,
      `Mensagem do usuário: "${sanitized}"`,
    ]);

    const cleaned = response.replace(/```(?:json)?\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const entities = parsed.entities || {};

    // A IA às vezes devolve PLACEHOLDER em vez do número ("[TELEFONE]", "número").
    // Aceitar isso fazia a Cleo responder “não encontrei [TELEFONE] nas suas
    // conexões” (visto no E2E, disconnect_collaborator). Só vale dígito válido;
    // senão, tenta extrair do texto original.
    const aiPhone = typeof entities.phone === 'string' ? normalizePhoneEntity(entities.phone) : undefined;
    const textPhone = extractPhoneEntity(text);
    const phone = aiPhone ?? textPhone;

    if (phone) {
      entities.phone = phone;
    } else {
      delete entities.phone;
    }

    const primaryType: IntentType = isValidIntent(parsed.type) ? parsed.type : 'unknown';
    const additionalIntents = normalizeAdditionalIntents(primaryType, parsed.additional_intents ?? parsed.additionalIntents);

    const aiResult: RecognizedIntent = {
      type: primaryType,
      confidence: parsed.confidence || 0.5,
      entities,
      originalText: text,
      additionalIntents,
    };

    // IA insegura? Tentar o fallback por keywords antes de desistir — evita
    // "Não entendi bem" para frases que keywords resolvem (ex: "como tá meu negócio hoje?").
    // O fallback também recupera o 2º pedido quando a IA só entendeu o 1º.
    if (aiResult.confidence < 0.7 || additionalIntents.length === 0) {
      const keywordResult = fallbackRecognize(text);
      const keywordIsBetter = keywordResult.confidence > aiResult.confidence && keywordResult.type !== 'unknown';

      // Confiança ok e a IA reconheceu algo: completa só pedidos de OUTRA oração.
      // `unknown` NÃO entra aqui: se a IA entendeu que é conversa casual
      // ("oi, hoje tá chuvoso"), anexar keywords genéricas ("hoje" → leads_today)
      // fazia a Cleo responder uma lista de clientes a um "bom dia".
      if (aiResult.confidence >= 0.7 && aiResult.type !== 'unknown') {
        // `additionalIntents` do fallback só existem quando o texto tem 2+
        // orações — uma frase única ("...status dos clientes novos hoje") não
        // adiciona nada. Antes o `keywordResult.type` era sempre anexado, e
        // "como tá a Ana hoje?" virava "detalhe da Ana" + lista de clientes.
        const keywordPrimary = keywordResult.type;

        // `list_leads` é genérico: se o texto pediu um recorte mais específico
        // ("clientes novos de hoje"), o recorte manda (o colapso troca o primary).
        const upgradePrimary = aiResult.type === 'list_leads'
          && QUERY_SPECIFICITY.includes(keywordPrimary)
          && keywordPrimary !== 'list_leads';

        aiResult.additionalIntents = mergeAdditional(
          aiResult.type,
          aiResult.additionalIntents,
          [
            ...(upgradePrimary ? [keywordPrimary] : []),
            ...(keywordResult.additionalIntents || []).map((i) => i.type),
          ],
        );
        return collapseResult(aiResult);
      }

      if (keywordIsBetter) return keywordResult;
    }

    return collapseResult(aiResult);
  } catch {
    return fallbackRecognize(text);
  }
}

/**
 * Aplica o colapso de consultas redundantes (list_leads × leads_today) a um
 * resultado vindo da IA ou do fallback.
 */
function collapseResult(result: RecognizedIntent): RecognizedIntent {
  const { primary, extras } = collapseRedundant(result.type, result.additionalIntents ?? []);

  return {
    ...result,
    type: primary,
    entities: primary === result.type ? result.entities : {},
    additionalIntents: extras,
  };
}

/** Acrescenta pedidos extras, ignorando os que já existem ou são inválidos. */
function mergeAdditional(
  primary: IntentType,
  current: Array<{ type: IntentType; entities: Record<string, string> }> | undefined,
  extras: IntentType[],
): Array<{ type: IntentType; entities: Record<string, string> }> {
  const list = current ? [...current] : [];
  const seen = new Set<IntentType>([primary, ...list.map((i) => i.type)]);

  for (const extra of extras) {
    if (extra === 'unknown' || seen.has(extra)) continue;
    seen.add(extra);
    list.push({ type: extra, entities: {} });
  }

  return list;
}

/**
 * Extrai telefone do texto livre. Aceita formatos com/sem código do país,
 * com/sem nono dígito: "5548999887766", "48 99887-766", "48999887766".
 * Retorna no formato usado em users.phone (com DDI 55).
 */
/**
 * Normaliza um telefone já “extraído” (texto da IA ou do usuário) para
 * 55DDNNNNNNNNN. Retorna undefined quando não parece telefone (ex.: "[TELEFONE]").
 */
export function normalizePhoneEntity(value: string): string | undefined {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 12 || digits.length === 13) return digits;
  return undefined;
}

function extractPhoneEntity(text: string): string | undefined {
  const match = text.match(/\b(\d[\d\s\-().]{8,17}\d)\b/);
  if (!match) return undefined;

  return normalizePhoneEntity(match[1]);
}

/**
 * Conectores que separam PEDIDOS distintos na mesma mensagem.
 *
 * "clientes novos de hoje, quem está sem resposta e quem está quente"
 * → 3 orações → 3 pedidos.
 */
const CLAUSE_SEPARATOR = /(?:[;,]|\s+e\s+|\s+depois\s+|\s+também\s+|\s+tb\s+|[?!.]+|\n)+/i;

/**
 * Consultas ordenadas da MAIS específica para a mais genérica.
 *
 * Serve para escolher UM pedido por oração: "ver o status dos clientes novos
 * hoje" casa list_leads + leads_today + lead_status, mas é um pedido só — o
 * mais específico (`leads_today`).
 */
const QUERY_SPECIFICITY: IntentType[] = [
  'no_reply', 'leads_today', 'hot_leads', 'list_ignored', 'list_leads', 'lead_status',
];

/** Pedidos que mudam estado ou exigem dados complementares do dono. */
const ACTION_INTENTS: IntentType[] = [
  'invite_user', 'disconnect_user', 'schedule_followup', 'send_material',
  'configure_rule', 'ignore_contact', 'stop_ignoring',
];

/**
 * Quebra a mensagem em orações.
 *
 * O fallback por keyword casava o texto INTEIRO, então uma única frase
 * ("ver o status dos clientes novos hoje") disparava list_leads + leads_today
 * + lead_status e a Cleo respondia com três blocos contraditórios — bug visto
 * no E2E, cenário `owner_command`.
 */
export function splitClauses(text: string): string[] {
  return text
    .toLowerCase()
    .split(CLAUSE_SEPARATOR)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

/**
 * Remove consultas redundantes na mesma resposta.
 *
 * `leads_today` é um recorte de `list_leads` (ambos vêm de `leads.status`),
 * então executar os dois imprime a MESMA pessoa duas vezes em headers
 * diferentes ("Seus clientes" + "Clientes novos de hoje"). Fica só o recorte
 * mais específico, preservando a ordem original.
 */
function collapseRedundant(
  primary: IntentType,
  extras: Array<{ type: IntentType; entities: Record<string, string> }>,
): { primary: IntentType; extras: Array<{ type: IntentType; entities: Record<string, string> }> } {
  const all = [{ type: primary, entities: {} as Record<string, string> }, ...extras];
  const has = (type: IntentType) => all.some((item) => item.type === type);

  if (!(has('list_leads') && has('leads_today'))) {
    return { primary, extras };
  }

  const seen = new Set<IntentType>();
  const unique = all
    .filter((item) => item.type !== 'list_leads')
    .filter((item) => {
      if (seen.has(item.type)) return false;
      seen.add(item.type);
      return true;
    });

  return { primary: unique[0].type, extras: unique.slice(1) };
}

/**
 * Fallback por keywords quando IA falha (ou para recuperar um 2º pedido que a
 * IA não viu). Cada oração vale no máximo UM pedido.
 */
function fallbackRecognize(text: string): RecognizedIntent {
  const patterns: Array<{ keywords: string[]; type: IntentType }> = [
    // Intents com telefone primeiro: matching por substring é sensível a falsos
    // positivos (ex.: "remove o acesso" contém "e o" de lead_status)
    { keywords: ['convida', 'adiciona conexão', 'adiciona a conexão', 'adiciona número', 'adiciona o número', 'adicionar número', 'convite'], type: 'invite_user' },
    { keywords: ['desconecta', 'remove conexão', 'remove a conexão', 'remove acesso', 'remove o acesso', 'remove usuário', 'remove o usuário', 'remove número', 'remove o número', 'desvincula', 'cancela acesso', 'cancela o acesso', 'cancelar acesso', 'cancelar o acesso', 'cancela número', 'cancela o número', 'cancelar número', 'cancelar o número', 'apaga conexão', 'apaga a conexão', 'tira acesso'], type: 'disconnect_user' },
    { keywords: ['leads', 'clientes', 'contatos', 'lista', 'mostra'], type: 'list_leads' },
    { keywords: ['hoje', 'novos', 'novo', 'chegou'], type: 'leads_today' },
    { keywords: ['sem resposta', 'pendente', 'devendo', 'não respondeu'], type: 'no_reply' },
    { keywords: ['quente', 'quentes', 'engajado', 'oportunidade'], type: 'hot_leads' },
    { keywords: ['agenda', 'lembrete', 'retorno', 'lembra'], type: 'schedule_followup' },
    { keywords: ['como tá', 'como esta', 'como está', 'status do', 'status da', 'novidade'], type: 'lead_status' },
    { keywords: ['manda', 'envia', 'material', 'orçamento', 'catálogo'], type: 'send_material' },
    { keywords: ['configura', 'muda', 'horário', 'automática'], type: 'configure_rule' },
    { keywords: ['ignora', 'pessoal', 'não é cliente', 'exclui'], type: 'ignore_contact' },
    { keywords: ['ignorados', 'excluídos', 'quem tá ignorado'], type: 'list_ignored' },
    { keywords: ['volta a acompanhar', 'para de ignorar', 'desbloqueia'], type: 'stop_ignoring' },
    { keywords: ['ajuda', 'help', 'o que você faz', 'comandos', 'como funciona'], type: 'help' },
  ];

  const buildEntities = (type: IntentType): Record<string, string> => {
    const entities: Record<string, string> = {};
    // Intents que operam sobre um telefone (convidar/desconectar)
    // precisam da entidade extraída mesmo sem IA disponível
    if (type === 'invite_user' || type === 'disconnect_user') {
      const phone = extractPhoneEntity(text);
      if (phone) entities.phone = phone;
    }
    return entities;
  };

  const requested: IntentType[] = [];

  // Uma oração = no máximo um pedido. Em
  // "clientes novos hoje e quem está sem resposta" as duas orações aparecem e
  // viram dois pedidos; já "status dos clientes novos hoje" é UMA oração e vira
  // um pedido só (antes virava três).
  for (const clause of splitClauses(text)) {
    const matched = patterns
      .map((pattern) => {
        const hits = pattern.keywords.filter((kw) => clause.includes(kw));
        return {
          type: pattern.type,
          strength: hits.reduce((max, hit) => Math.max(max, hit.length), 0),
        };
      })
      .filter((match) => match.strength > 0);

    if (matched.length === 0) continue;

    const queries = matched.filter((m) => QUERY_SPECIFICITY.includes(m.type));
    const actions = matched.filter((m) => ACTION_INTENTS.includes(m.type));

    let chosen: IntentType | undefined;
    if (queries.length > 0) {
      // Consulta mais específica da oração (no_reply > leads_today > ... > list_leads)
      const best = Math.min(...queries.map((q) => QUERY_SPECIFICITY.indexOf(q.type)));
      chosen = QUERY_SPECIFICITY[best];
    } else if (actions.length > 0) {
      // Ação com a keyword mais longa ("para de ignorar" vence "ignora")
      chosen = actions.sort((a, b) => b.strength - a.strength)[0].type;
    } else if (matched.some((m) => m.type === 'help')) {
      chosen = 'help';
    }

    if (chosen && !requested.includes(chosen)) requested.push(chosen);
  }

  if (requested.length === 0) {
    return { type: 'unknown', confidence: 0, entities: {}, originalText: text };
  }

  const collapsed = collapseRedundant(
    requested[0],
    requested.slice(1).map((type) => ({ type, entities: buildEntities(type) })),
  );

  const primary = collapsed.primary;
  const additionalIntents = collapsed.extras
    .filter((item) => item.type !== primary)
    .map((item) => ({ type: item.type, entities: buildEntities(item.type) }));

  return {
    type: primary,
    confidence: 0.75,
    entities: buildEntities(primary),
    originalText: text,
    additionalIntents,
  };
}
