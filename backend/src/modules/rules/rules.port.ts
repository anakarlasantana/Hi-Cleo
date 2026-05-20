import type { Rule } from '../../shared/types/index.js';

export interface RuleRepository {
  listActive(userId: string): Promise<Rule[]>;
  create(userId: string, condition: string, response: string): Promise<Rule>;
  insertMany(rules: Array<{ user_id: string; condition: string; response: string; active: boolean }>): Promise<void>;
}
