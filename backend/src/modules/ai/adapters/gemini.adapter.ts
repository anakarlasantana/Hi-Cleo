import { geminiModel } from '../../../shared/config/gemini.js';
import type { AiPort } from '../../../shared/ports/ai.port.js';

export class GeminiAdapter implements AiPort {
  async generateContent(prompts: string[]): Promise<string> {
    const result = await geminiModel.generateContent(prompts);
    return result.response.text().trim();
  }
}
