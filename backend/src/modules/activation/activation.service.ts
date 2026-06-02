import type { AiPort } from '../../shared/ports/ai.port.js';
import type { ActivationRepository, UserRepository } from './activation.port.js';
import type { OnboardingRepository } from '../onboarding/onboarding.port.js';
import type { ActivationCode, User } from '../../shared/types/index.js';
import type { TermsConsentService } from '../terms/terms.service.js';
import { sanitizeForAiPrompt } from '../../shared/middleware/sanitize.js';

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
    private termsConsentService?: TermsConsentService,
  ) {}

  async generateCode(paymentId: string, plan: string): Promise<ActivationCode> {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.activationRepo.createCode(code, plan, paymentId, expiresAt);
  }

  async validateCode(code: string): Promise<ActivationCode | null> {
    return this.activationRepo.findValidCode(code);
  }

  async activateUser(code: string, phone: string, rawMessage: string, termsAccepted?: boolean): Promise<User> {
    // Requirement 3.1, 3.2: Exigir aceite explícito dos termos antes de ativar
    if (this.termsConsentService && !termsAccepted) {
      throw new Error('TERMS_CONSENT_REQUIRED');
    }

    const parsed = await this.parseActivationMessage(rawMessage);
    const validCode = await this.activationRepo.findValidCode(code);

    const user = await this.userRepo.create({
      name: parsed.nome,
      phone: phone,
      plan: validCode?.plan || 'solo',
    });

    await this.activationRepo.markUsed(code, user.id);

    // Save business profile
    await this.userRepo.createBusiness(user.id, {
      name: parsed.negocio || undefined,
      services: parsed.servicos || undefined,
      business_hours_start: parsed.horario_inicio || '08:00',
      business_hours_end: parsed.horario_fim || '18:00',
    });

    await this.onboardingRepo.create(user.id, 'confirm_name', parsed);

    // Registrar consentimento após criação do usuário
    if (this.termsConsentService && termsAccepted) {
      const { CURRENT_TERMS_VERSION } = await import('../terms/terms.service.js');
      await this.termsConsentService.recordConsent(user.id, CURRENT_TERMS_VERSION);
    }

    return user;
  }

  private async parseActivationMessage(message: string): Promise<Record<string, string>> {
    try {
      const sanitized = sanitizeForAiPrompt(message);

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
        `Mensagem: "${sanitized}"`,
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
