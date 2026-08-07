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
}
