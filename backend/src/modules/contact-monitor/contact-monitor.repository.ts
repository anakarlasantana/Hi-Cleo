import { supabase } from '../../shared/config/supabase.js';
import type { ContactMonitorRepository } from './contact-monitor.port.js';

export class SupabaseContactMonitorRepository implements ContactMonitorRepository {
  async getContactCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) throw new Error(`Erro ao contar contatos: ${error.message}`);
    return count || 0;
  }

  async getTotalContacts(): Promise<number> {
    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    if (error) throw new Error(`Erro ao contar total de contatos: ${error.message}`);
    return count || 0;
  }

  async getContactCountPerUser(): Promise<Array<{ userId: string; count: number }>> {
    // Use a raw query to group by user_id and count leads per user
    const { data, error } = await supabase
      .from('leads')
      .select('user_id');

    if (error) throw new Error(`Erro ao buscar contatos por usuário: ${error.message}`);
    if (!data || data.length === 0) return [];

    // Aggregate counts per user in memory
    const countMap = new Map<string, number>();
    for (const row of data) {
      const userId = row.user_id as string;
      countMap.set(userId, (countMap.get(userId) || 0) + 1);
    }

    return Array.from(countMap.entries()).map(([userId, count]) => ({
      userId,
      count,
    }));
  }
}
