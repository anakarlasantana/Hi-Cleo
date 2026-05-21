import type { ContactMonitorRepository, SystemMetrics } from './contact-monitor.port.js';

/**
 * Threshold padrão de contatos totais no sistema para emitir alerta.
 * Pode ser sobrescrito via variável de ambiente CONTACT_ALERT_THRESHOLD.
 *
 * Requirement 2.4: Se o custo estimado de armazenamento no Supabase exceder
 * o orçamento definido, emitir alertas para o administrador.
 */
const DEFAULT_ALERT_THRESHOLD = 100_000;

export class ContactMonitorService {
  private alertThreshold: number;

  constructor(private repo: ContactMonitorRepository) {
    this.alertThreshold =
      Number(process.env.CONTACT_ALERT_THRESHOLD) || DEFAULT_ALERT_THRESHOLD;
  }

  /**
   * Retorna a quantidade de contatos de um usuário específico.
   *
   * Requirement 2.5: Registrar métricas de quantidade de contatos por Usuário
   * para monitoramento contínuo.
   */
  async getContactCount(userId: string): Promise<number> {
    return this.repo.getContactCount(userId);
  }

  /**
   * Retorna métricas agregadas do sistema: total de contatos,
   * média por usuário e máximo por usuário.
   *
   * Requirement 2.5: Métricas para monitoramento contínuo.
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const perUser = await this.repo.getContactCountPerUser();

    if (perUser.length === 0) {
      return { totalContacts: 0, avgPerUser: 0, maxPerUser: 0 };
    }

    const totalContacts = perUser.reduce((sum, entry) => sum + entry.count, 0);
    const avgPerUser = Math.round(totalContacts / perUser.length);
    const maxPerUser = Math.max(...perUser.map((entry) => entry.count));

    return { totalContacts, avgPerUser, maxPerUser };
  }

  /**
   * Verifica se o total de contatos no sistema excede o threshold configurado.
   * Retorna true se o alerta deve ser emitido.
   *
   * Requirement 2.4: Emitir alertas quando custo estimado exceder orçamento.
   */
  async checkAlertThreshold(): Promise<boolean> {
    const totalContacts = await this.repo.getTotalContacts();
    return totalContacts >= this.alertThreshold;
  }
}
