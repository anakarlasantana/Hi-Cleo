/**
 * Judge — LLM que avalia a qualidade de uma conversa da Cleo.
 * Avalia em múltiplas dimensões e retorna scores + parecer.
 *
 * Cenários conversacionais: 5 dimensões originais
 * Cenários técnicos/funcionais: 5 dimensões + corretude_funcional
 */

import type { AiClient } from './ai-client.js';
import type { Turn } from './simulator.js';
import type { Persona } from './autonomous-user.js';
import type { Scenario } from './config.js';

/** Scores base (5 dimensões conversacionais) */
export interface BaseScores {
  relevancia: number;
  tom_de_voz: number;
  factualidade: number;
  completude: number;
  naturalidade: number;
}

/** Scores expandidos (inclui corretude funcional) */
export interface FunctionalScores extends BaseScores {
  corretude_funcional: number;
}

export interface Verdict {
  scores: BaseScores | FunctionalScores;
  media: number;
  pass: boolean;
  razao: string;
  problemas: string[];
}

/** Cenários que usam avaliação funcional (5 dims + corretude_funcional) */
const FUNCTIONAL_SCENARIOS: Scenario[] = [
  'trial_flow',
  'payment_webhook',
  'invite_flow',
  'material_flow',
  'local_classifier',
  'configure_rules',
  'degraded_fallback',
  'prospection_response',
  'disconnect_collaborator',
  'subscription_expired',
  'subscription_renewal',
  'cancellation_flow',
];

/** Cenários conversacionais puros (apenas 5 dimensões) */
const CONVERSATIONAL_SCENARIOS: Scenario[] = [
  'onboarding',
  'client_message',
  'owner_command',
  'edge_case',
];

/** Verifica se cenário usa dimensão funcional */
export function isFunctionalScenario(scenario: Scenario): boolean {
  return FUNCTIONAL_SCENARIOS.includes(scenario);
}

const JUDGE_PROMPT = `Você é um avaliador de qualidade de chatbots conversacionais.
Sua tarefa é avaliar as respostas da "Cleo" — uma secretária virtual por WhatsApp para pequenos negócios.

REGRAS DA CLEO (do produto):
- Nunca inventa informações (preços, prazos, detalhes que o dono não informou)
- Responde no tom configurado pelo dono
- Para clientes: anota interesse e avisa que o dono retorna
- Para o dono: executa comandos (listar leads, agendar, etc.)
- No onboarding: coleta dados do negócio em 7 etapas conversacionais
- Deve ser natural, empática e concisa

CONTEXTO DA CONVERSA:
- Persona: {persona_name}
- Cenário: {scenario}
- Descrição: {persona_description}

TRANSCRIÇÃO:
{transcript}

FIDELIDADE À TRANSCRIÇÃO (obrigatório):
- A transcrição é a ÚNICA fonte de verdade. Não invente falas, trechos nem fatos.
- Se for citar algo, copie LITERALMENTE da transcrição. Se não conseguir copiar, descreva sem aspas.
- A "Descrição" acima é o contexto de quem é a persona — NÃO é uma lista de pedidos.
  Avalie só o que a persona REALMENTE pediu na transcrição; não penalize a Cleo por
  assuntos que o usuário nunca mencionou.
- Se a transcrição terminar com uma fala da Cleo, o usuário simulado encerrou a conversa:
  avalie o que foi pedido, sem cobrar continuidade.

AVALIE em 5 dimensões (0.0 a 1.0):

1. **relevancia** (0-1): As respostas da Cleo fazem sentido no contexto? Respondem ao que foi perguntado?
2. **tom_de_voz** (0-1): A Cleo soa natural, empática e profissional? Parece um humano e não um robô?
3. **factualidade** (0-1): A Cleo inventou algo que não deveria? (1.0 = não inventou nada)
4. **completude** (0-1): A Cleo atendeu o que o usuário precisava? Avançou o fluxo corretamente?
5. **naturalidade** (0-1): As respostas são naturais e fluidas? Não são genéricas demais nem robóticas?

CRITÉRIOS DE FALHA GRAVE (score 0 na dimensão):
- Inventar preço, horário ou dado que não foi configurado
- Ignorar completamente o que o usuário disse
- Repetir a mesma resposta em loop
- Quebrar o fluxo de onboarding (pular steps, perder dados)
- Responder em inglês quando deveria ser português

EXPECTATIVAS POR CENÁRIO (conversacionais):
- client_message: A Cleo atende um CLIENTE do negócio. Se o negócio tem preços/horários configurados (como "Corte R$ 35" ou "atende sábado 9h-17h"), ela PODE e DEVE informar esses valores — isso não é inventar, é usar o contexto do negócio. Se a informação não existir, acolher, anotar e prometer retorno do dono é o comportamento CORRETO (não penalize factualidade, nem completude abaixo de 0.7 se ela tratou todos os tópicos da mensagem).
- owner_command: A Cleo lista apenas os leads REAIS do banco. Se existe só 1 lead, listar só esse está certo. A Cleo não consegue saber se "material chegou" no WhatsApp do cliente — dizer que não pode confirmar o recebimento é honesto e correto. Avalie se ela executou os comandos de listagem/follow-up pedidos.
- client_outside_hours: O cliente escreveu FORA do horário de atendimento. A Cleo deve deixar claro que o 
  negócio está fora do horário e quando retorna (ex.: “amanhã a partir das 9h”). Resposta curta e acolhedora = sucesso.
- trial_limit_reached: O dono está em trial e esgotou o limite de respostas automáticas. A Cleo deve avisar o 
  cliente, SEM prometer preço/horário e SEM inventar. Um aviso gracioso (“o responsável vai te responder”) = sucesso. ATENÇÃO: nesse cenário a MESMA resposta se repete a cada mensagem porque o limite está esgotado — repetição aqui é o comportamento correto, não penalize.
- client_unknown_question: O cliente pergunta algo que o negócio NÃO informou. A Cleo NÃO deve inventar: deve 
  acolher, dizer que vai confirmar com o responsável. Inventar preço/serviço = falha grave.
- client_multi_request: O cliente faz DOIS pedidos na mesma mensagem (ex.: preço E horário de sábado). A Cleo 
  precisa responder os DOIS na mesma resposta. Responder só um = completude baixa.
- edge_case: O usuário manda mensagens vagas, gírias, mudanças de assunto. A Cleo deve ENGAGAR naturalmente com o conteúdo (sem repetir o mesmo texto), manter tom leve e, quando fizer sentido, oferecer algo CONCRETO que ela pode fazer (ex: "quer ver quem tá sem resposta?"). Repetir a mesma piada/oferta em respostas seguidas é um problema; não exigir oferta em TODAS as respostas também é importante. Se ela engajou e se mostrou útil na conversa, foi bem-sucedida — não exija "avanço de fluxo de onboarding" aqui.

Retorne APENAS JSON válido (sem markdown):
{
  "scores": {
    "relevancia": 0.0,
    "tom_de_voz": 0.0,
    "factualidade": 0.0,
    "completude": 0.0,
    "naturalidade": 0.0
  },
  "razao": "Explicação curta do parecer geral",
  "problemas": ["lista de problemas encontrados, se houver"]
}`;

const JUDGE_PROMPT_FUNCTIONAL = `Você é um avaliador de qualidade de chatbots conversacionais.
Sua tarefa é avaliar as respostas da "Cleo" — uma secretária virtual por WhatsApp para pequenos negócios.

REGRAS DA CLEO (do produto):
- Nunca inventa informações (preços, prazos, detalhes que o dono não informou)
- Responde no tom configurado pelo dono
- Para clientes: anota interesse e avisa que o dono retorna
- Para o dono: executa comandos (listar leads, agendar, etc.)
- No onboarding: coleta dados do negócio em 7 etapas conversacionais
- Deve ser natural, empática e concisa

CONTEXTO DA CONVERSA:
- Persona: {persona_name}
- Cenário: {scenario}
- Descrição: {persona_description}

CENÁRIO ESPECÍFICO E O QUE DEVE ACONTECER:
{scenario_expectation}

TRANSCRIÇÃO:
{transcript}

FIDELIDADE À TRANSCRIÇÃO (obrigatório):
- A transcrição é a ÚNICA fonte de verdade. Não invente falas, trechos nem fatos.
- Se for citar algo, copie LITERALMENTE da transcrição. Se não conseguir copiar, descreva sem aspas.
- A "Descrição" acima é o contexto de quem é a persona — NÃO é uma lista de pedidos.
  Avalie só o que a persona REALMENTE pediu na transcrição; não penalize a Cleo por
  assuntos que o usuário nunca mencionou.
- Se a transcrição terminar com uma fala da Cleo, o usuário simulado encerrou a conversa:
  avalie o que foi pedido, sem cobrar continuidade.

AVALIE em 6 dimensões (0.0 a 1.0):

1. **relevancia** (0-1): As respostas da Cleo fazem sentido no contexto? Respondem ao que foi perguntado?
2. **tom_de_voz** (0-1): A Cleo soa natural, empática e profissional? Parece um humano e não um robô?
3. **factualidade** (0-1): A Cleo inventou algo que não deveria? (1.0 = não inventou nada)
4. **completude** (0-1): A Cleo atendeu o que o usuário precisava? Avançou o fluxo corretamente?
5. **naturalidade** (0-1): As respostas são naturais e fluidas? Não são genéricas demais nem robóticas?
6. **corretude_funcional** (0-1): O sistema executou corretamente a AÇÃO ESPERADA? Veja as expectativas abaixo:

EXPECTATIVAS POR CENÁRIO:
- trial_flow: Trial foi criado, código de ativação enviado, limites respeitados
- payment_webhook: Pagamento processado, subscription ativada, confirmação enviada
- invite_flow: Convite enviado, colaborador adicionado (ou mensagem clara de como fazer)
- prospection_response: O ex-trial respondeu à prospecção. SUCESSO = a Cleo classificou a resposta (interesse → envia o link de planos; desinteresse → confirma que não vai mais contatar). Se o usuário disse que NÃO tem interesse e a Cleo confirmou que não vai mais contatar, isso está CERTO — não penalize por “não reconhecer interesse”. Avalie o que o usuário realmente disse na transcrição.
- material_flow: Material recebido/salvo, confirmação de reenvio quando solicitado
- local_classifier: Saudação respondida rapidamente sem chamar IA pesada, resposta adequada e curta
- configure_rules: Configuração alterada ou confirmada, feedback claro ao dono
- degraded_fallback: ALGUMA resposta foi enviada mesmo com IA indisponível (fallback gracioso)
- disconnect_collaborator: Sessão do colaborador desconectada, slot liberado, confirmação clara ao dono
- subscription_expired: Nenhuma resposta ao cliente após expiração (Cleo 100% inoperante)
- subscription_renewal: Nova expiração soma a partir da data anterior (não penaliza renovação antecipada)
- cancellation_flow: Cancelamento processado, acesso mantido até fim do período, dados preservados

CRITÉRIOS DE FALHA GRAVE (score 0 na dimensão):
- Inventar preço, horário ou dado que não foi configurado
- Ignorar completamente o que o usuário disse
- Repetir a mesma resposta em loop
- Não executar a ação funcional esperada (corretude_funcional = 0)
- Responder em inglês quando deveria ser português

Retorne APENAS JSON válido (sem markdown):
{
  "scores": {
    "relevancia": 0.0,
    "tom_de_voz": 0.0,
    "factualidade": 0.0,
    "completude": 0.0,
    "naturalidade": 0.0,
    "corretude_funcional": 0.0
  },
  "razao": "Explicação curta do parecer geral",
  "problemas": ["lista de problemas encontrados, se houver"]
}`;

/** Expectativas por cenário funcional para o prompt */
function getScenarioExpectation(scenario: Scenario): string {
  switch (scenario) {
    case 'trial_flow':
      return 'O dono iniciou o trial. ESPERADO: código de ativação gerado, mensagem de boas-vindas, trial ativo.';
    case 'payment_webhook':
      return 'Webhook de pagamento aprovado. ESPERADO: subscription ativada no banco, confirmação ao usuário.';
    case 'invite_flow':
      return 'Dono quer convidar colaborador. ESPERADO: convite processado ou instruções claras fornecidas.';
    case 'prospection_response':
      return 'Ex-trial respondeu à prospecção. ESPERADO: resposta classificada como interesse/desinteresse e fluxo seguido.';
    case 'material_flow':
      return 'Dono enviou material (documento). ESPERADO: material recebido, confirmação e capacidade de reenvio.';
    case 'local_classifier':
      return 'Cliente mandou saudação simples. ESPERADO: resposta rápida, curta e adequada SEM chamar IA pesada.';
    case 'configure_rules':
      return 'Dono pediu mudança de configuração. ESPERADO: configuração alterada e feedback confirmando a mudança.';
    case 'degraded_fallback':
      return 'IA indisponível. ESPERADO: ALGUMA resposta chegou (fallback gracioso, não silêncio).';
    case 'disconnect_collaborator':
      return 'Dono pediu para desconectar um colaborador. ESPERADO: Cleo confirma a desconexão, avisa que a vaga foi liberada.';
    case 'subscription_expired':
      return 'Assinatura expirada. ESPERADO: NENHUMA resposta ao cliente (Cleo 100% inoperante).';
    case 'subscription_renewal':
      return 'Renovação antecipada. ESPERADO: expiração somada a partir da data anterior, dados intactos.';
    case 'cancellation_flow':
      return 'Cancelamento solicitado. ESPERADO: acesso mantido até fim do período, confirmação enviada, dados preservados.';
    default:
      return '';
  }
}

export async function evaluateConversation(
  ai: AiClient,
  persona: Persona,
  turns: Turn[],
  passThreshold: number,
): Promise<Verdict> {
  const transcript = turns
    .map((t, index) => `[${index + 1}] ${t.role === 'user' ? 'Usuário' : 'Cleo'}: ${t.content}`)
    .join('\n');

  const useFunctional = isFunctionalScenario(persona.scenario);

  let prompt: string;
  if (useFunctional) {
    prompt = JUDGE_PROMPT_FUNCTIONAL
      .replace('{persona_name}', persona.name)
      .replace('{scenario}', persona.scenario)
      .replace('{persona_description}', persona.description)
      .replace('{scenario_expectation}', getScenarioExpectation(persona.scenario))
      .replace('{transcript}', transcript);
  } else {
    prompt = JUDGE_PROMPT
      .replace('{persona_name}', persona.name)
      .replace('{scenario}', persona.scenario)
      .replace('{persona_description}', persona.description)
      .replace('{transcript}', transcript);
  }

  let response = await ai.generate(
    'Você é um avaliador imparcial. Retorne APENAS JSON válido, sem markdown.',
    prompt,
  );

  // Parse tolerante com 1 retry (alguns modelos/trancripts poluídos geram lixo na 1ª tentativa)
  let parsed: { scores: Record<string, number>; razao: string; problemas: string[] } | null = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    if (attempt > 0) {
      console.warn(`   ⚠️  Judge retornou JSON inválido — tentando novamente (${attempt + 1}/2)...`);
      response = await ai.generate(
        'ATENÇÃO: responda ESTRITAMENTE com um único objeto JSON válido, sem markdown, sem explicações antes ou depois.',
        prompt,
      );
    }
    parsed = tryParseJudgeResponse(response);
  }

  if (!parsed) {
    if (process.env.E2E_DEBUG) {
      console.error(`   🐛 Resposta bruta do judge (início): ${response.slice(0, 300)}`);
    }
    // Se falhou o parse, retorna score neutro com o erro
    const defaultScores: BaseScores = {
      relevancia: 0.5,
      tom_de_voz: 0.5,
      factualidade: 0.5,
      completude: 0.5,
      naturalidade: 0.5,
    };
    return {
      scores: useFunctional
        ? { ...defaultScores, corretude_funcional: 0.5 }
        : defaultScores,
      media: 0.5,
      pass: false,
      razao: `Erro ao avaliar: resposta do judge não é JSON válido`,
      problemas: ['Judge retornou resposta inválida'],
    };
  }

  const scores = parsed.scores;
  const values = Object.values(scores);
  const media = values.reduce((a, b) => a + b, 0) / values.length;

  return {
    scores: scores as unknown as BaseScores | FunctionalScores,
    media: Math.round(media * 100) / 100,
    pass: media >= passThreshold,
    razao: parsed.razao,
    problemas: sanitizeJudgeProblems(parsed.problemas, transcript),
  };
}

/** Normaliza texto para comparar citação do judge com a transcrição. */
function normalizeForQuoteCheck(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Descarta problemas que citam trechos que NÃO existem na transcrição.
 *
 * O judge é uma LLM e alucinava citações: no E2E de 2026-11-01 reprovou o
 * cenário `owner_command` apontando "antes de mergulhar nos números" e "tomar
 * café" — falas que a Cleo nunca enviou (a resposta era uma lista determinística).
 * Citação inventada derruba o score do produto por um defeito do avaliador.
 *
 * Só remove quando o trecho entre aspas (≥4 chars) não aparece na transcrição.
 * Problemas descritos sem aspas continuam valendo — paráfrase é legítima.
 */
export function sanitizeJudgeProblems(problemas: string[] | undefined, transcript: string): string[] {
  if (!Array.isArray(problemas) || problemas.length === 0) return [];

  const normalizedTranscript = normalizeForQuoteCheck(transcript);

  return problemas.filter((problem) => {
    if (typeof problem !== 'string') return false;

    const quotes = [...problem.matchAll(/["'“”‘’]([^"'“”‘’]{4,})["'“”‘’]/g)].map((match) => match[1]);
    const invented = quotes.filter((quote) => {
      const normalizedQuote = normalizeForQuoteCheck(quote);
      return normalizedQuote.length > 0 && !normalizedTranscript.includes(normalizedQuote);
    });

    if (invented.length === 0) return true;

    console.warn(`   ⚠️  Judge citou trecho inexistente — problema descartado: "${invented[0].slice(0, 60)}"`);
    return false;
  });
}

/**
 * Tenta extrair o JSON de avaliação da resposta do judge.
 * Tolerante a: tags <think>, markdown fences, lixo antes do { e depois do } final,
 * e trailing commas. Retorna null se não conseguir.
 */
function tryParseJudgeResponse(
  response: string,
): { scores: Record<string, number>; razao: string; problemas: string[] } | null {
  let jsonStr = response
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```(?:json)?\s*/g, '')
    .trim();

  // Isola o maior bloco JSON: do primeiro { ao último }
  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  jsonStr = jsonStr.slice(start, end + 1);

  // Remove trailing commas (alguns modelos adicionam vírgula antes de } / ])
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Avaliação determinística para cenários técnicos (sem LLM).
 * Retorna um Verdict baseado em verificações diretas.
 */
export function evaluateDeterministic(
  scenario: Scenario,
  checks: { label: string; passed: boolean }[],
): Verdict {
  const passedChecks = checks.filter(c => c.passed).length;
  const totalChecks = checks.length;
  const corretude = totalChecks > 0 ? passedChecks / totalChecks : 0;

  const problemas = checks
    .filter(c => !c.passed)
    .map(c => c.label);

  const scores: FunctionalScores = {
    relevancia: 1.0, // N/A para determinístico — neutro
    tom_de_voz: 1.0,
    factualidade: 1.0,
    completude: corretude,
    naturalidade: 1.0,
    corretude_funcional: corretude,
  };

  const values = Object.values(scores);
  const media = values.reduce((a, b) => a + b, 0) / values.length;

  return {
    scores,
    media: Math.round(media * 100) / 100,
    pass: corretude >= 0.8,
    razao: corretude === 1.0
      ? 'Todas as verificações passaram'
      : `${passedChecks}/${totalChecks} verificações passaram`,
    problemas,
  };
}
