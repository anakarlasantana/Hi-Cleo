import type { RuleRepository } from './rules.port.js';
import type { User, Lead } from '../../shared/types/index.js';

export interface MessageContext {
  user: User;
  lead: Lead;
  isNewLead: boolean;
  messageText: string;
  timestamp: Date;
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
        case 'primeira_mensagem':
          if (context.isNewLead) return rule.response;
          break;

        case 'fora_horario':
          if (this.isOutsideBusinessHours(context.user, context.timestamp)) {
            return rule.response;
          }
          break;

        case 'lembrete':
          return rule.response;
      }
    }

    return null;
  }

  isOutsideBusinessHours(user: User, timestamp: Date): boolean {
    const inicio = user.horario_comercial_inicio || '08:00';
    const fim = user.horario_comercial_fim || '18:00';

    const hours = timestamp.getHours();
    const minutes = timestamp.getMinutes();
    const current = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    return current < inicio || current > fim;
  }
}
