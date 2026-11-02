import type { AiPort } from '../../shared/ports/ai.port.js';
import type { Message, RecognizedIntent } from '../../shared/types/index.js';
import { formatConversationHistory, normalizeForCompare, repeatsSentence } from '../../shared/utils/conversation-history.js';
import { recognizeIntent } from '../ai/nodes/recognize-intent.js';

/** Quantas mensagens de histórico entram no prompt (economia de tokens). */
export const CONVERSATIONAL_HISTORY_LIMIT = 6;

export interface ConversationalReplyOptions {
  /** Nome do negócio (deixa a oferta de ajuda concreta, não genérica). */
  businessName?: string;
  /**
   * Catálogo de planos (preços REAIS do banco).
   *
   * Sem isso a Cleo respondia “ainda não tenho os valores aqui” quando o dono ou
   * um ex-trial perguntava o preço — mesmo com os valores em `plan_limits`
   * (o E2E flagrou isso em `prospection_response`).
   */
  plans?: Array<{ name: string; priceMonthly: number }>;
}

/**
 * Service de reconhecimento de intenções do dono.
 * Delega para o nó recognize-intent (futuro nó router do LangGraph).
 *
 * No LangGraph futuro, este service será substituído pelo grafo de assistente.
 */
export class AssistenteService {
  constructor(private ai: AiPort) {}

  async recognize(text: string): Promise<RecognizedIntent> {
    return recognizeIntent(this.ai, text);
  }

  /**
   * Gera uma resposta conversacional curta para mensagens do dono que não são
   * comandos reconhecidos (small talk, mensagens vagas). Usado como fallback
   * inteligente no executeIntent, evitando repetir sempre o mesmo menu fixo.
   *
   * Recebe o histórico recente (mais novo primeiro, como vem do banco) por dois
   * motivos vistos no E2E:
   * 1. Sem contexto a Cleo repetia a MESMA piada/pergunta a cada mensagem vaga;
   * 2. O doc do produto promete uma Cleo proativa — a oferta de ajuda precisa
   *    ser concreta e variar, nunca um menu repetido.
   *
   * Se a resposta sair idêntica à última da Cleo, regenera UMA vez pedindo
   * variação explícita (mesma estratégia do atendimento ao cliente).
   */
  async generateConversationalReply(
    ownerName: string,
    message: string,
    recentMessages: Message[] = [],
    options: ConversationalReplyOptions = {},
  ): Promise<string> {
    const history = formatConversationHistory(
      recentMessages.slice(0, CONVERSATIONAL_HISTORY_LIMIT),
      { inboundLabel: ownerName },
    );

    const systemPrompt = this.buildConversationalPrompt(ownerName, options.businessName, history, options.plans);
    const userPrompt = `Mensagem do dono: "${message}"`;

    const first = await this.ai.generateContent([systemPrompt, userPrompt]);

    // Histórico vem em ordem DESC: o primeiro outbound é a última fala da Cleo.
    const lastCleoReply = recentMessages.find((msg) => msg.direction === 'outbound')?.text;
    const repeated = !!lastCleoReply
      && (normalizeForCompare(first) === normalizeForCompare(lastCleoReply)
        || repeatsSentence(first, lastCleoReply));

    if (!lastCleoReply || !repeated) {
      return first;
    }

    try {
      const retry = await this.ai.generateContent([
        `${systemPrompt}\n\nATENÇÃO: sua resposta anterior foi idêntica a esta, que você JÁ mandou: "${lastCleoReply}". ` +
          'NÃO repita. Reaja ao que o dono acabou de dizer e ofereça algo concreto e diferente.',
        userPrompt,
      ]);
      return normalizeForCompare(retry) === normalizeForCompare(lastCleoReply) ? first : retry;
    } catch {
      // IA indisponível na regeneração — devolve a primeira resposta
      return first;
    }
  }

  /**
   * Prompt do reply conversacional do dono.
   *
   * Regra de ouro (docs/produto/personalidade-cleo.md): a Cleo é "proativa — não
   * espera ser perguntada" e o dono precisa "sentir valor a cada interação".
   * Por isso a oferta de ajuda é permitida — mas UMA, concreta e nunca repetida
   * (a versão anterior proibia qualquer oferta e a Cleo virava só piada).
   */
  private buildConversationalPrompt(
    ownerName: string,
    businessName: string | undefined,
    history: string | undefined,
    plans?: Array<{ name: string; priceMonthly: number }>,
  ): string {
    const who = businessName ? `${ownerName} (${businessName})` : ownerName;

    const rules = [
      `Você é a Cleo, secretária virtual de WhatsApp de ${who || 'um profissional'}.`,
      'O dono mandou uma mensagem casual, vaga ou de brincadeira (não é um comando de trabalho).',
      'Responda DIRETAMENTE ao que ele disse, em 1-2 frases curtas, com humor e naturalidade — como uma pessoa responderia.',
      'Quando fizer sentido, ofereça em UMA frase curta algo concreto que você pode fazer agora (ex: "quer ver quem tá sem resposta?").',
      'Você só sabe fazer isto: ver clientes (novos, quentes, sem resposta, status de um contato), agendar lembretes/retornos, guardar e reenviar materiais e ajustar configurações da conta. NUNCA ofereça outra capacidade (tocar música, playlist, previsão do tempo, pedir comida, etc.).',
      'NUNCA liste um menu de comandos nem repita ofertas, piadas ou perguntas que já aparecem no histórico. '
        + 'Se você JÁ ofereceu ajuda nesta conversa, apenas responda ao que a pessoa disse, sem oferecer de novo.',
      'Não invente dados (números, nomes, preços). Não diga que é uma IA.',
      'Responda em português brasileiro.',
    ].join(' ');

    const priceList = (plans ?? [])
      .filter((plan) => plan.priceMonthly > 0)
      .map((plan) => `${plan.name}: R$ ${(plan.priceMonthly / 100).toFixed(2).replace('.', ',')}/mês`)
      .join(' · ');

    const withPrices = priceList
      ? `${rules} PREÇOS ATUAIS (valores reais — pode informar se perguntarem): ${priceList}.`
      : rules;

    return history
      ? `${withPrices}\n\nCONVERSA ATÉ AGORA (mais antiga primeiro):\n${history}`
      : withPrices;
  }
}

