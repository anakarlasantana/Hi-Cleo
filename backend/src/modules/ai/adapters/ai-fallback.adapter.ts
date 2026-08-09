import type { AiPort } from '../../../shared/ports/ai.port.js';
import type { Logger } from '../../../shared/logger/logger.js';

/**
 * Callback para alertar o admin sobre problemas de IA.
 * Injetado pelo container — desacopla o adapter do messaging.
 */
export type AiAlertCallback = (message: string) => Promise<void>;

export class AiFallbackAdapter implements AiPort {
  private providers: { name: string; adapter: AiPort }[];
  private logger: Logger;
  private onAlert?: AiAlertCallback;

  // Controle de alertas (cooldown para não spammar)
  private lastAllFailedAlert = 0;
  private lastProviderDownAlerts: Map<string, number> = new Map();
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
        this.logger.warn({ provider: name, err: error }, `${name} falhou, tentando próximo provider`);
        await this.alertProviderDown(name, error);
      }
    }

    this.logger.error('todos os providers de IA falharam');
    await this.alertAllFailed();
    throw new Error('AI_ALL_PROVIDERS_FAILED');
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
   * O outro assume, mas admin é avisado.
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
