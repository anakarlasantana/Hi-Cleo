import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { env } from '../../../shared/config/env.js';
import type { AiPort } from '../../../shared/ports/ai.port.js';

export const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-flash', 'gemini-flash-latest'];

export class GeminiAdapter implements AiPort {
  private genAI: GoogleGenerativeAI;
  private models: string[];
  private activeIndex = 0;

  constructor(models = GEMINI_MODELS) {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    this.models = models;
  }

  get activeModel(): string {
    return this.models[this.activeIndex];
  }

  async generateContent(prompts: string[]): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: this.activeModel });
    const result = await model.generateContent(prompts);
    return result.response.text().trim();
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
