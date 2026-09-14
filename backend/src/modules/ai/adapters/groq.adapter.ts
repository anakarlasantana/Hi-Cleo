import Groq from 'groq-sdk';
import type { AiPort } from '../../../shared/ports/ai.port.js';
import { env } from '../../../shared/config/env.js';
import { stripThinkingTags } from '../../../shared/middleware/sanitize.js';

// Modelos ativos no Groq (llama-3.3 e mixtral foram descontinuados — 404 model_not_found).
// gpt-oss-120b primeiro: melhor qualidade/limites; fallbacks em ordem.
export const GROQ_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

export class GroqAdapter implements AiPort {
  private client: Groq;
  private models: string[];
  private activeIndex = 0;

  constructor(models = GROQ_MODELS) {
    this.client = new Groq({ apiKey: env.GROQ_API_KEY || '' });
    this.models = models;
  }

  get activeModel(): string {
    return this.models[this.activeIndex];
  }

  async generateContent(prompts: string[]): Promise<string> {
    // Cascata interna: se um modelo retorna 404 (descontinuado) ou 429 de cota
    // diária (TPD do free tier), tenta o próximo modelo da lista antes de
    // delegar ao AiFallbackAdapter. Mantém a Cleo funcionando mesmo com o
    // modelo primário esgotado.
    let lastError: any;
    for (let attempt = this.activeIndex; attempt < this.models.length; attempt++) {
      const model = this.models[attempt];
      try {
        const response = await this.client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: prompts[0] },
            { role: 'user', content: prompts.slice(1).join('\n') },
          ],
          temperature: 0.3,
          max_tokens: 1024,
          // Controle de "thinking" por família: qwen3 usa reasoning_format='hidden',
          // gpt-oss usa reasoning_effort='low' (evita resposta vazia quando o
          // budget inteiro era consumido só pelo raciocínio interno)
          ...(model.startsWith('qwen/')
            ? ({ reasoning_format: 'hidden' } as any)
            : model.startsWith('openai/gpt-oss')
              ? ({ reasoning_effort: 'low' } as any)
              : {}),
        });

        this.activeIndex = attempt; // lembra o modelo saudável
        const content = response.choices[0]?.message?.content?.trim() || '';
        // Qwen pode retornar <think>...</think> antes da resposta real (tag pode
        // ficar aberta se estourar max_tokens — o util cobre esse caso)
        return stripThinkingTags(content);
      } catch (error: any) {
        lastError = error;
        if (!this.shouldAdvanceModel(error) || attempt + 1 >= this.models.length) throw error;
      }
    }
    throw lastError;
  }

  /** 404 (modelo inexistente/descontinuado) ou 429 de cota diária (TPD). */
  private shouldAdvanceModel(error: any): boolean {
    const status = error?.status;
    const message = String(error?.message ?? '');
    if (status === 404) return true;
    // TPM/RPM são temporários (minuto) — não vale trocar por causa deles.
    if (status === 429 && (message.includes('tokens per day') || message.includes('TPD'))) return true;
    if (message.includes('no longer available') || message.includes('not found') || message.includes('decommissioned')) return true;
    return false;
  }

  /**
   * Tenta o próximo modelo da lista. Retorna true se há fallback disponível.
   */
  advanceModel(): { switched: boolean; previous: string; current: string } {
    const previous = this.activeModel;
    if (this.activeIndex + 1 >= this.models.length) {
      return { switched: false, previous, current: previous };
    }
    this.activeIndex++;
    return { switched: true, previous, current: this.activeModel };
  }
}
