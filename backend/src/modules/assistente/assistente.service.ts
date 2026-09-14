import type { AiPort } from '../../shared/ports/ai.port.js';
import type { RecognizedIntent } from '../../shared/types/index.js';
import { recognizeIntent } from '../ai/nodes/recognize-intent.js';

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
   */
  async generateConversationalReply(ownerName: string, message: string): Promise<string> {
    return this.ai.generateContent([
      `Você é a Cleo, assistente virtual de WhatsApp de ${ownerName || 'um profissional'}. ` +
        'O dono mandou uma mensagem casual ou vaga (não é um comando de trabalho). ' +
        'Responda DIRETAMENTE ao que ele disse, em 1-2 frases curtas, com humor e naturalidade ' +
        '(responda piadas, provocações e perguntas pessoais como uma pessoa responderia). ' +
        'Não invente dados. Não repita menus de exemplos. ' +
        'NÃO termine toda resposta oferecendo ajuda com clientes/lembretes/agenda — ' +
        'só mencione isso se fizer sentido no contexto, e varie quando aparecer. ' +
        'Responda em português brasileiro.',
      `Mensagem do dono: "${message}"`,
    ]);
  }
}
