import Groq from 'groq-sdk';
import type { AiPort } from '../../../shared/ports/ai.port.js';
import { env } from '../../../shared/config/env.js';

export const GROQ_MODELS = ['qwen/qwen3.6-27b', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'];

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
    const response = await this.client.chat.completions.create({
      model: this.activeModel,
      messages: [
        { role: 'system', content: prompts[0] },
        { role: 'user', content: prompts.slice(1).join('\n') },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content?.trim() || '';
    // Qwen retorna <think>...</think> antes da resposta real
    return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
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
