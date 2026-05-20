import Groq from 'groq-sdk';
import type { AiPort } from '../../shared/ports/ai.port.js';
import { env } from '../../shared/config/env.js';

export class GroqAdapter implements AiPort {
  private client: Groq;

  constructor() {
    this.client = new Groq({ apiKey: env.GROQ_API_KEY || '' });
  }

  async generateContent(prompts: string[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: prompts[0] },
        { role: 'user', content: prompts.slice(1).join('\n') },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }
}
