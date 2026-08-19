import axios from 'axios';
import type { AiPort } from '../../../shared/ports/ai.port.js';
import { env } from '../../../shared/config/env.js';

export const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-v4-flash', 'deepseek-reasoner'];

export class DeepSeekAdapter implements AiPort {
  private apiKey: string;
  private baseURL = 'https://api.deepseek.com/chat/completions';
  private models: string[];
  private activeIndex = 0;

  constructor(models = DEEPSEEK_MODELS) {
    this.apiKey = env.DEEPSEEK_API_KEY || '';
    this.models = models;
  }

  get activeModel(): string {
    return this.models[this.activeIndex];
  }

  async generateContent(prompts: string[]): Promise<string> {
    const response = await axios.post(
      this.baseURL,
      {
        model: this.activeModel,
        messages: [
          { role: 'system', content: prompts[0] },
          { role: 'user', content: prompts.slice(1).join('\n') },
        ],
        temperature: 0.3,
        max_tokens: 500,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 30_000,
      },
    );

    return response.data.choices[0]?.message?.content?.trim() || '';
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
