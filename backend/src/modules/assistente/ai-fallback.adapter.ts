import type { AiPort } from '../../shared/ports/ai.port.js';
import type { Logger } from '../../shared/logger/logger.js';

export class AiFallbackAdapter implements AiPort {
  private providers: { name: string; adapter: AiPort }[];
  private logger: Logger;

  constructor(providers: { name: string; adapter: AiPort }[], logger: Logger) {
    this.providers = providers;
    this.logger = logger.child({ module: 'ai-fallback' });
  }

  async generateContent(prompts: string[]): Promise<string> {
    for (const { name, adapter } of this.providers) {
      try {
        const result = await adapter.generateContent(prompts);
        return result;
      } catch (error) {
        this.logger.warn({ provider: name, err: error }, `${name} falhou, tentando próximo provider`);
      }
    }

    this.logger.error('todos os providers de IA falharam');
    throw new Error('AI_ALL_PROVIDERS_FAILED');
  }
}
