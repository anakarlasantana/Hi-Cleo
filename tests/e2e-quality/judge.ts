/**
 * Judge — LLM que avalia a qualidade de uma conversa da Cleo.
 * Avalia em múltiplas dimensões e retorna scores + parecer.
 */

import type { AiClient } from './ai-client.js';
import type { Turn } from './simulator.js';
import type { Persona } from './autonomous-user.js';

export interface Verdict {
  scores: {
    relevancia: number;
    tom_de_voz: number;
    factualidade: number;
    completude: number;
    naturalidade: number;
  };
  media: number;
  pass: boolean;
  razao: string;
  problemas: string[];
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

export async function evaluateConversation(
  ai: AiClient,
  persona: Persona,
  turns: Turn[],
  passThreshold: number,
): Promise<Verdict> {
  const transcript = turns
    .map(t => `[${t.role === 'user' ? 'Usuário' : 'Cleo'}]: ${t.content}`)
    .join('\n');

  const prompt = JUDGE_PROMPT
    .replace('{persona_name}', persona.name)
    .replace('{scenario}', persona.scenario)
    .replace('{persona_description}', persona.description)
    .replace('{transcript}', transcript);

  const response = await ai.generate(
    'Você é um avaliador imparcial. Retorne APENAS JSON válido, sem markdown.',
    prompt,
  );

  // Parse da resposta
  let jsonStr = response
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```json?\n?/g, '')
    .replace(/```/g, '')
    .trim();

  // Se tem lixo antes do {, corta
  const objStart = jsonStr.indexOf('{');
  if (objStart > 0) jsonStr = jsonStr.slice(objStart);

  let parsed: { scores: Verdict['scores']; razao: string; problemas: string[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Se falhou o parse, retorna score neutro com o erro
    return {
      scores: { relevancia: 0.5, tom_de_voz: 0.5, factualidade: 0.5, completude: 0.5, naturalidade: 0.5 },
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
    scores,
    media: Math.round(media * 100) / 100,
    pass: media >= passThreshold,
    razao: parsed.razao,
    problemas: parsed.problemas || [],
  };
}
