import type { AiPort } from '../../../shared/ports/ai.port.js';
import type { Logger } from '../../../shared/logger/logger.js';

/**
 * Callback para alertar o admin sobre problemas de IA.
 * Injetado pelo container — desacopla o adapter do messaging.
 */
export type AiAlertCallback = (message: string) => Promise<void>;

/**
 * Interface para adapters que suportam fallback de modelo.
 */
interface ModelFallbackCapable {
  activeModel: string;
  advanceModel(): { switched: boolean; previous: string; current: string };
}

function hasModelFallback(adapter: AiPort): adapter is AiPort & ModelFallbackCapable {
  return 'advanceModel' in adapter && 'activeModel' in adapter;
}

export class AiFallbackAdapter implements AiPort {
  private providers: { name: string; adapter: AiPort }[];
  private logger: Logger;
  private onAlert?: AiAlertCallback;

  // Controle de alertas (cooldown para não spammar)
  private lastAllFailedAlert = 0;
  private lastProviderDownAlerts: Map<string, number> = new Map();
  private lastDeprecationAlerts: Map<string, number> = new Map();
  private static readonly ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 min entre alertas iguais

  // Contador diário de chamadas
  private dailyCalls = 0;
  private dailyCallsDate = '';
  private dailyBudget: number;
  private budgetAlertSent = false;

  constructor(
    providers: { name: string; adapter: AiPort }[],
    logger: Logger,
    onAlert?: AiAlertCallback,
    dailyBudget = 5000,
  ) {
    this.providers = providers;
    this.logger = logger.child({ module: 'ai-fallback' });
    this.onAlert = onAlert;
    this.dailyBudget = dailyBudget;
  }

  async generateContent(prompts: string[]): Promise<string> {
    this.trackDailyUsage();

    for (const { name, adapter } of this.providers) {
      try {
        const result = await adapter.generateContent(prompts);
        return result;
      } catch (error: any) {
        // Se o erro é de modelo descontinuado e o adapter suporta fallback
        if (this.isModelDeprecated(error) && hasModelFallback(adapter)) {
          const retryResult = await this.handleModelDeprecation(name, adapter, prompts, error);
          if (retryResult !== null) return retryResult;
        }

        this.logger.warn({ provider: name, err: error }, `${name} falhou, tentando próximo provider`);
        await this.alertProviderDown(name, error);
      }
    }

    this.logger.error('todos os providers de IA falharam');
    await this.alertAllFailed();
    throw new Error('AI_ALL_PROVIDERS_FAILED');
  }

  /**
   * Detecta se o erro indica modelo descontinuado/não encontrado.
   */
  private isModelDeprecated(error: any): boolean {
    const status = error?.status ?? error?.response?.status ?? error?.httpStatusCode ?? error?.code;
    const message = String(error?.message ?? error?.response?.data?.error?.message ?? '');
    return (
      status === 404 ||
      message.includes('no longer available') ||
      message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('decommissioned')
    );
  }

  /**
   * Tenta modelos alternativos do mesmo provider.
   * Se funcionar, alerta o admin sobre a troca.
   */
  private async handleModelDeprecation(
    providerName: string,
    adapter: AiPort & ModelFallbackCapable,
    prompts: string[],
    originalError: any,
  ): Promise<string | null> {
    const deprecatedModel = adapter.activeModel;

    while (true) {
      const advance = adapter.advanceModel();
      if (!advance.switched) break;

      this.logger.warn(
        { provider: providerName, from: advance.previous, to: advance.current },
        `modelo ${advance.previous} descontinuado, tentando ${advance.current}`,
      );

      try {
        const result = await adapter.generateContent(prompts);

        // Sucesso com modelo alternativo — alerta admin
        await this.alertModelDeprecation(providerName, deprecatedModel, advance.current);
        return result;
      } catch (retryError: any) {
        // Se também é 404, tenta o próximo modelo
        if (this.isModelDeprecated(retryError)) continue;
        // Outro erro — para de tentar modelos desse provider
        break;
      }
    }

    return null;
  }

  /**
   * Alerta o admin que um modelo foi descontinuado e o sistema trocou automaticamente.
   */
  private async alertModelDeprecation(providerName: string, oldModel: string, newModel: string): Promise<void> {
    const key = `${providerName}:${oldModel}`;
    const now = Date.now();
    const lastAlert = this.lastDeprecationAlerts.get(key) || 0;
    if (now - lastAlert < AiFallbackAdapter.ALERT_COOLDOWN_MS) return;

    this.lastDeprecationAlerts.set(key, now);

    await this.sendAlert(
      `🔄 *Modelo de IA descontinuado*\n\n` +
      `*Provider:* ${providerName}\n` +
      `*Modelo anterior:* ${oldModel} (descontinuado)\n` +
      `*Modelo atual:* ${newModel} (fallback automático)\n\n` +
      `A Cleo continua funcionando normalmente.\n\n` +
      `⚠️ *Ação necessária:* atualize a lista de modelos no código para refletir a mudança e evitar uso de fallbacks menos otimizados.`
    );
  }

  /**
   * Conta chamadas diárias e alerta ao atingir 80% do orçamento.
   */
  private trackDailyUsage(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.dailyCallsDate) {
      this.dailyCalls = 0;
      this.dailyCallsDate = today;
      this.budgetAlertSent = false;
    }

    this.dailyCalls++;

    if (!this.budgetAlertSent && this.dailyCalls >= this.dailyBudget * 0.8) {
      this.budgetAlertSent = true;
      this.sendAlert(
        `📊 *Alerta de uso IA*\n\n${this.dailyCalls} chamadas hoje (80% do limite de ${this.dailyBudget}).\nSe ultrapassar, pode indicar bug ou uso anormal.\n\nNenhuma ação necessária — é só aviso.`
      );
    }
  }

  /**
   * Alerta quando um provider individual falha (rate limit, fora do ar).
   */
  private async alertProviderDown(providerName: string, error: any): Promise<void> {
    const now = Date.now();
    const lastAlert = this.lastProviderDownAlerts.get(providerName) || 0;
    if (now - lastAlert < AiFallbackAdapter.ALERT_COOLDOWN_MS) return;

    this.lastProviderDownAlerts.set(providerName, now);

    const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
    const reason = isRateLimit ? 'rate limit / quota excedida' : 'erro de comunicação';

    await this.sendAlert(
      `⚠️ *IA parcialmente indisponível*\n\n*${providerName}* falhou: ${reason}.\nO fallback está assumindo — Cleo continua funcionando.\n\nVerifique billing/status do ${providerName}.`
    );
  }

  /**
   * Alerta quando TODOS os providers falham.
   */
  private async alertAllFailed(): Promise<void> {
    const now = Date.now();
    if (now - this.lastAllFailedAlert < AiFallbackAdapter.ALERT_COOLDOWN_MS) return;

    this.lastAllFailedAlert = now;

    const providerNames = this.providers.map(p => p.name).join(', ');
    await this.sendAlert(
      `🚨 *ALERTA CRÍTICO — IA fora do ar*\n\nTodos os providers falharam (${providerNames}).\nA Cleo está respondendo com fallback básico.\n\nAção necessária: verificar billing e status dos serviços.`
    );
  }

  private async sendAlert(message: string): Promise<void> {
    if (!this.onAlert) return;
    try {
      await this.onAlert(message);
    } catch {
      // Não propagar — já estamos em estado de falha
    }
  }
}
