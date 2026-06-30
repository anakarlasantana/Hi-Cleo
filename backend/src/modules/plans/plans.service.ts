import type { PlanRepository } from './plans.port.js';

export class PlanService {
  constructor(private planRepo: PlanRepository) {}

  /**
   * Verifica se o usuário pode adicionar um novo usuário (sessão WhatsApp)
   * ao seu plano. Retorna false se o limite foi atingido.
   *
   * Requirement 1.2: Quando excede o limite, rejeitar conexão e informar
   * necessidade de upgrade.
   */
  async canAddUser(userId: string): Promise<boolean> {
    const usage = await this.getCurrentUsage(userId);
    return usage.current < usage.max;
  }

  /**
   * Retorna o uso atual de usuários (sessões ativas) e o limite máximo
   * do plano do usuário (respeitando override customizado).
   *
   * Requirement 1.1: Solo = 1, Equipe = até 3, Empresa = até 8.
   * Requirement 3.2, 3.4: max_connections_override prevalece sobre plano.
   */
  async getCurrentUsage(userId: string): Promise<{ current: number; max: number }> {
    const maxConnections = await this.planRepo.getUserMaxConnections(userId);
    const currentCount = await this.planRepo.countActiveUsers(userId);

    return {
      current: currentCount,
      max: maxConnections,
    };
  }

  /**
   * Retorna slots restantes para uso em endpoints e UI.
   */
  async getRemainingSlots(userId: string): Promise<{ used: number; total: number; remaining: number }> {
    const usage = await this.getCurrentUsage(userId);
    return {
      used: usage.current,
      total: usage.max,
      remaining: usage.max - usage.current,
    };
  }

  /**
   * Processa o downgrade de plano, desconectando usuários excedentes.
   *
   * Requirement 1.4: Quando faz downgrade, desconectar usuários excedentes
   * ao final do período de cobrança.
   */
  async handleDowngrade(userId: string, newPlan: string): Promise<void> {
    const planLimit = await this.planRepo.getPlanLimit(newPlan);
    if (!planLimit) {
      throw new Error(`Plano "${newPlan}" não encontrado na tabela de limites`);
    }

    await this.planRepo.disconnectExcessUsers(userId, planLimit.max_users);
  }
}
