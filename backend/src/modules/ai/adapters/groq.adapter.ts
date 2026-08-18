import Groq from 'groq-sdk';
import type { AiPort } from '../../../shared/ports/ai.port.js';
import { env } from '../../../shared/config/env.js';

export class GroqAdapter implements AiPort {
  private client: Groq;

  constructor() {
    this.client = new Groq({ apiKey: env.GROQ_API_KEY || '' });
  }

  async generateContent(prompts: string[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
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
}
