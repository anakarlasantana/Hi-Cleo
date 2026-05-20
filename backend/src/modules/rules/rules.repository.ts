import { supabase } from '../../shared/config/supabase.js';
import type { RuleRepository } from './rules.port.js';
import type { Rule } from '../../shared/types/index.js';

export class SupabaseRuleRepository implements RuleRepository {
  async listActive(userId: string): Promise<Rule[]> {
    const { data } = await supabase
      .from('rules')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true);

    return (data || []) as Rule[];
  }

  async create(userId: string, condition: string, response: string): Promise<Rule> {
    const { data, error } = await supabase
      .from('rules')
      .insert({ user_id: userId, condition, response, active: true })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar regra: ${error.message}`);
    return data as Rule;
  }

  async insertMany(rules: Array<{ user_id: string; condition: string; response: string; active: boolean }>): Promise<void> {
    if (rules.length > 0) {
      await supabase.from('rules').insert(rules);
    }
  }
}
