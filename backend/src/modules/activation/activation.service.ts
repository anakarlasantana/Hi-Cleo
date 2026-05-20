import type { AiPort } from '../../shared/ports/ai.port.js';
import type { ActivationRepository, UserRepository } from './activation.port.js';
import type { OnboardingRepository } from '../onboarding/onboarding.port.js';
import type { ActivationCode, User } from '../../shared/types/index.js';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ATIVAR-${code}`;
}

export class ActivationService {
  constructor(
    private activationRepo: ActivationRepository,
    private userRepo: UserRepository,
    private onboardingRepo: OnboardingRepository,
    private ai: AiPort,
  ) {}

  async generateCode(paymentId: string, plano: string): Promise<ActivationCode> {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.activationRepo.createCode(code, plano, paymentId, expiresAt);
  }

  async validateCode(code: string): Promise<ActivationCode | null> {
    return this.activationRepo.findValidCode(code);
  }

  async activateUser(code: string, phone: string, rawMessage: string): Promise<User> {
    const parsed = await this.parseActivationMessage(rawMessage);
    const validCode = await this.activationRepo.findValidCode(code);

    const user = await this.userRepo.create({
      nome: parsed.nome,
      telefone: phone,
      plano: validCode?.plano || 'solo',
      horario_comercial_inicio: parsed.horario_inicio || '08:00',
      horario_comercial_fim: parsed.horario_fim || '18:00',
    });

    await this.activationRepo.markUsed(code, user.id);
    await this.onboardingRepo.create(user.id, 'confirmar_nome', parsed);

    return user;
  }

  private async parseActivationMessage(message: string): Promise<Record<string, string>> {
    try {
      const response = await this.ai.generateContent([
        `Extraia as informações desta mensagem de ativação de um CRM WhatsApp.
O formato esperado é: ATIVAR-XXXX | Nome | Negócio | Serviços | Horário
Mas o usuário pode escrever de forma livre.

Retorne APENAS JSON válido (sem markdown):
{
  "nome": "nome da pessoa",
  "negocio": "nome do negócio",
  "servicos": "serviços oferecidos",
  "horario_inicio": "HH:MM",
  "horario_fim": "HH:MM"
}

Se não conseguir extrair algum campo, use string vazia.`,
        `Mensagem: "${message}"`,
      ]);

      return JSON.parse(response);
    } catch {
      const parts = message.split('|').map((p) => p.trim());
      return {
        nome: parts[1] || '',
        negocio: parts[2] || '',
        servicos: parts[3] || '',
        horario_inicio: '08:00',
        horario_fim: '18:00',
      };
    }
  }
}
