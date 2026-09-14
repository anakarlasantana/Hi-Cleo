/**
 * Classificador local — resolve mensagens simples sem chamar providers de IA.
 *
 * Objetivo: reduzir 30-50% das chamadas de IA, diminuindo custo e latência.
 * Cada match aqui é uma chamada que NÃO vai pro DeepSeek/Groq/Gemini.
 *
 * Estratégia:
 * - Saudações genéricas → template direto (não precisa de IA pra responder "oi")
 * - Keywords exatas do dono → bypass intent recognition
 * - NÃO tenta resolver mensagens complexas — na dúvida, retorna null e deixa a IA decidir
 */

export interface ClassificationResult {
  /** Se true, a mensagem foi resolvida localmente (não precisa de IA) */
  resolved: boolean;
  /** Intent reconhecida localmente (quando resolved=true para msgs do dono) */
  intent?: string;
  /** Resposta pronta para enviar (quando resolved=true para msgs de clientes) */
  response?: string;
}

// --- Padrões de saudação (clientes) ---

const GREETING_PATTERNS = [
  /^(oi|olá|ola|hey|eai|e ai|eaí)\s*[!?.,]*$/i,
  /^(bom dia|boa tarde|boa noite)\s*[!?.,]*$/i,
  /^(opa|fala|salve|beleza)\s*[!?.,]*$/i,
  /^(tudo bem|tudo bom|td bem|tudo certo)\s*[?!.,]*$/i,
  /^(hi|hello|hey there)\s*[!?.,]*$/i,
];

// --- Keywords do dono (bypass intent recognition) ---

const OWNER_KEYWORD_INTENTS: { patterns: RegExp[]; intent: string }[] = [
  {
    patterns: [
      /^(ajuda|help|comandos|o que voc[eê] faz)\s*[?!.]*$/i,
    ],
    intent: 'help',
  },
  {
    patterns: [
      /^(quem t[aá] ignorado|ignorados|lista ignorados)\s*[?!.]*$/i,
    ],
    intent: 'list_ignored',
  },
  {
    patterns: [
      /^(meus clientes|mostra.*clientes|leads)\s*[?!.]*$/i,
    ],
    intent: 'list_leads',
  },
  {
    patterns: [
      /^(clientes (novos )?de hoje|leads de hoje|novos de hoje)\s*[?!.]*$/i,
    ],
    intent: 'leads_today',
  },
  {
    patterns: [
      /^(quem t[aá] sem resposta|sem retorno|pendentes)\s*[?!.]*$/i,
    ],
    intent: 'no_reply',
  },
  {
    patterns: [
      /^(clientes quentes|leads quentes|quentes)\s*[?!.]*$/i,
    ],
    intent: 'hot_leads',
  },
];

/**
 * Classifica mensagem de CLIENTE (lead do dono).
 * Detecta saudações simples que não precisam de IA para responder.
 *
 * @returns resultado com resolved=true se for saudação, null/resolved=false se precisa de IA
 */
export function classifyClientMessage(text: string): ClassificationResult {
  const trimmed = text.trim();

  // Mensagens muito curtas (1-2 chars) provavelmente são typos — deixar IA resolver
  if (trimmed.length < 2) {
    return { resolved: false };
  }

  // Saudações simples — não precisa de IA
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(trimmed)) {
      // Retorna resolved=true SEM response — o caller usa o businessContext pra gerar o template
      return { resolved: true, intent: 'greeting' };
    }
  }

  return { resolved: false };
}

/**
 * Classifica mensagem do DONO (secretária).
 * Detecta intents simples por keyword match, evitando chamar IA.
 *
 * Só resolve intents que são keywords EXATAS ou quase exatas.
 * Qualquer coisa com entidades (nome, telefone, data) vai pra IA.
 *
 * @returns resultado com intent se match exato, null se precisa de IA
 */
export function classifyOwnerMessage(text: string): ClassificationResult {
  const trimmed = text.trim();

  // Muito curto pra ser comando — provavelmente é resposta a algo
  if (trimmed.length < 3) {
    return { resolved: false };
  }

  // Muito longo pra ser keyword simples — provavelmente é conversa ou comando complexo
  if (trimmed.length > 60) {
    return { resolved: false };
  }

  for (const { patterns, intent } of OWNER_KEYWORD_INTENTS) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return { resolved: true, intent };
      }
    }
  }

  return { resolved: false };
}
