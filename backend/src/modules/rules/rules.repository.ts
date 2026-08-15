import { eq, and } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { rules } from '../../shared/schema.js';
import type { RuleRepository } from './rules.port.js';
import type { Rule } from '../../shared/types/index.js';

export class DrizzleRuleRepository implements RuleRepository {
  async listActive(userId: string): Promise<Rule[]> {
    const data = await db
      .select()
      .from(rules)
      .where(and(eq(rules.userId, userId), eq(rules.active, true)));

    return data as unknown as Rule[];
  }

  async create(userId: string, condition: string, response: string): Promise<Rule> {
    const [data] = await db
      .insert(rules)
      .values({ userId, condition, response, active: true })
      .returning();

    if (!data) throw new Error('Erro ao criar regra');
    return data as unknown as Rule;
  }

  async insertMany(rulesList: Array<{ user_id: string; condition: string; response: string; active: boolean }>): Promise<void> {
    if (rulesList.length > 0) {
      await db.insert(rules).values(
        rulesList.map((r) => ({
          userId: r.user_id,
          condition: r.condition,
          response: r.response,
          active: r.active,
        })),
      );
    }
  }
}
