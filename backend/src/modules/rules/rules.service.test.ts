import { describe, it, expect } from 'vitest';
import { formatReminder, type ReminderContext } from './rules.service.js';

describe('formatReminder', () => {
  it('formats a reminder with a single contact', () => {
    const context: ReminderContext = {
      description: 'Reunião com cliente',
      time: '14:00',
      contacts: [{ nome: 'João Silva', telefone: '11999887766' }],
    };

    const result = formatReminder(context);

    expect(result).toBe(
      '🔔 Lembrete: Reunião com cliente às 14:00.\nContato: João Silva - 11999887766',
    );
  });

  it('formats a reminder with multiple contacts', () => {
    const context: ReminderContext = {
      description: 'Reunião de equipe',
      time: '10:30',
      contacts: [
        { nome: 'Ana Costa', telefone: '11988776655' },
        { nome: 'Pedro Lima', telefone: '21977665544' },
      ],
    };

    const result = formatReminder(context);

    expect(result).toBe(
      '🔔 Lembrete: Reunião de equipe às 10:30.\nContato: Ana Costa - 11988776655\nPedro Lima - 21977665544',
    );
  });

  it('omits contact line when contact has no phone', () => {
    const context: ReminderContext = {
      description: 'Reunião com fornecedor',
      time: '16:00',
      contacts: [{ nome: 'Maria Santos', telefone: undefined }],
    };

    const result = formatReminder(context);

    expect(result).toBe('🔔 Lembrete: Reunião com fornecedor às 16:00.');
  });

  it('omits contact line when contact has empty phone', () => {
    const context: ReminderContext = {
      description: 'Almoço de negócios',
      time: '12:00',
      contacts: [{ nome: 'Carlos Souza', telefone: '' }],
    };

    const result = formatReminder(context);

    expect(result).toBe('🔔 Lembrete: Almoço de negócios às 12:00.');
  });

  it('filters out contacts without phone from a mixed list', () => {
    const context: ReminderContext = {
      description: 'Apresentação',
      time: '09:00',
      contacts: [
        { nome: 'Ana Costa', telefone: '11988776655' },
        { nome: 'Sem Telefone', telefone: undefined },
        { nome: 'Pedro Lima', telefone: '21977665544' },
        { nome: 'Vazio', telefone: '' },
      ],
    };

    const result = formatReminder(context);

    expect(result).toBe(
      '🔔 Lembrete: Apresentação às 09:00.\nContato: Ana Costa - 11988776655\nPedro Lima - 21977665544',
    );
  });

  it('formats reminder with no contacts', () => {
    const context: ReminderContext = {
      description: 'Revisão de projeto',
      time: '15:00',
      contacts: [],
    };

    const result = formatReminder(context);

    expect(result).toBe('🔔 Lembrete: Revisão de projeto às 15:00.');
  });
});
