import axios from 'axios';
import type { AiPort } from '../../../shared/ports/ai.port.js';
import { env } from '../../../shared/config/env.js';

export class DeepSeekAdapter implements AiPort {
  private apiKey: string;
  private baseURL = 'https://api.deepseek.com/chat/completions';

  constructor() {
    this.apiKey = env.DEEPSEEK_API_KEY || '';
  }

  async generateContent(prompts: string[]): Promise<string> {
    const response = await axios.post(
      this.baseURL,
      {
        model: 'deepseek-chat',
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
}
