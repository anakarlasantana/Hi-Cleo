import type { RuleRepository } from './rules.port.js';
import type { User, Lead } from '../../shared/types/index.js';

export interface MessageContext {
  user: User;
  lead: Lead;
  isNewLead: boolean;
  messageText: string;
  timestamp: Date;
  businessHoursStart?: string;
  businessHoursEnd?: string;
}

export interface ReminderContext {
  description: string;
  time: string;
  contacts: Array<{ nome: string; telefone?: string }>;
}

export function formatReminder(context: ReminderContext): string {
  let msg = `🔔 Lembrete: ${context.description} às ${context.time}.`;

  const contactsWithPhone = context.contacts.filter(
    (c) => c.telefone && c.telefone.trim() !== '',
  );

  if (contactsWithPhone.length > 0) {
    const contactLines = contactsWithPhone
      .map((c) => `${c.nome} - ${c.telefone}`)
      .join('\n');
    msg += `\nContato: ${contactLines}`;
  }

  return msg;
}

export class RuleEngine {
  constructor(private ruleRepo: RuleRepository) {}

  async evaluate(context: MessageContext): Promise<string | null> {
    const rules = await this.ruleRepo.listActive(context.user.id);

    for (const rule of rules) {
      switch (rule.condition) {
        case 'first_message':
          if (context.isNewLead) return rule.response;
          break;

        case 'outside_hours':
          if (this.isOutsideBusinessHours(context.user, context.timestamp, { businessHoursStart: context.businessHoursStart, businessHoursEnd: context.businessHoursEnd })) {
            return rule.response;
          }
          break;

        case 'reminder':
          return rule.response;
      }
    }

    return null;
  }

  isOutsideBusinessHours(user: User, timestamp: Date, context?: { businessHoursStart?: string; businessHoursEnd?: string }): boolean {
    const start = context?.businessHoursStart || '08:00';
    const end = context?.businessHoursEnd || '18:00';

    const hours = timestamp.getHours();
    const minutes = timestamp.getMinutes();
    const current = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    return current < start || current > end;
  }
}
