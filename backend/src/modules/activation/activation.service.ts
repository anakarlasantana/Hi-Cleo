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

  async generateCode(paymentId: string, plan: string, userId?: string, userEmail?: string): Promise<ActivationCode> {
    const code = generateCode();
    const ACTIVATION_CODE_EXPIRY_DAYS = 7;
    const expiresAt = new Date(Date.now() + ACTIVATION_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    return this.activationRepo.createCode(code, plan, paymentId, expiresAt, userId, userEmail);
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

    if (!validCode) {
      throw new Error('INVALID_OR_EXPIRED_CODE');
    }

    let user: User;

    // Novo fluxo: se o código tem user_id, complementa user existente (criado no pagamento/trial)
    // Drizzle retorna camelCase (userId), tipo legado usa snake_case (user_id) — suportamos ambos
    const codeUserId = (validCode as any).userId || validCode.user_id;
    if (codeUserId) {
      const existingUser = await this.userRepo.findById(codeUserId);
      if (!existingUser) {
        throw new Error('USER_NOT_FOUND_FOR_CODE');
      }
      // Complementar user com phone e name (se phone já estiver preenchido, só atualiza name)
      user = await this.userRepo.complementUser(existingUser.id, {
        phone,
        name: parsed.nome || existingUser.name || phone,
      });
    } else {
      // Fluxo legado: criar user novo (para códigos antigos sem user_id)
      user = await this.userRepo.create({
        name: parsed.nome,
        phone: phone,
        plan: validCode.plan || 'solo',
      });
    }

    await this.activationRepo.markUsed(code, user.id);

    // Save business profile
    await this.userRepo.createBusiness(user.id, {
      name: parsed.negocio || undefined,
      services: parsed.servicos || undefined,
      business_hours_start: parsed.horario_inicio || '08:00',
      business_hours_end: parsed.horario_fim || '18:00',
    });

    await this.onboardingRepo.create(user.id, 'awaiting_intro_confirmation', parsed);

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

      const parsed = JSON.parse(response) as Record<string, string>;

      // A IA pode devolver JSON válido mas com campos vazios/incompletos
      // (observado no E2E: onboarding começava sem negócio e sem nome, e a Cleo
      // saudava pelo nome e depois perguntava "como posso te chamar?").
      // O formato delimitado por '|' é determinístico: quando a mensagem segue
      // esse formato, ele é a fonte de verdade e a IA só complementa lacunas.
      if (message.includes('|')) {
        const fallback = this.parseActivationMessageFallback(message);
        return {
          nome: (parsed.nome || '').trim() || fallback.nome,
          negocio: (parsed.negocio || '').trim() || fallback.negocio,
          servicos: (parsed.servicos || '').trim() || fallback.servicos,
          horario_inicio: (parsed.horario_inicio || '').trim() || fallback.horario_inicio,
          horario_fim: (parsed.horario_fim || '').trim() || fallback.horario_fim,
        };
      }

      return parsed;
    } catch {
      return this.parseActivationMessageFallback(message);
    }
  }

  /**
   * Parser determinístico do formato `ATIVAR-XXXX | Nome | Negócio | Serviços | Horário`.
   *
   * Usado quando a IA falha OU quando ela devolve JSON válido sem os campos
   * (observado em teste). Sem isso, o usuário era saudado pelo nome e em seguida
   * questionado "como posso te chamar?" — o onboarding perdia o contexto da ativação.
   */
  private parseActivationMessageFallback(message: string): Record<string, string> {
    const parts = message.split('|').map((p) => p.trim());
    const timeMatch = (parts[4] || '').match(/(\d{1,2})[:h]?(\d{0,2})/);
    const endMatch = (parts[4] || '').match(/(\d{1,2})[:h]?(\d{0,2})\s*(?:às|as|a|-|–|—|e)?\s*(\d{1,2})[:h]?(\d{0,2})/);

    const start = endMatch
      ? `${endMatch[1].padStart(2, '0')}:${(endMatch[2] || '00').padStart(2, '0')}`
      : timeMatch
        ? `${timeMatch[1].padStart(2, '0')}:${(timeMatch[2] || '00').padStart(2, '0')}`
        : '08:00';
    const end = endMatch
      ? `${endMatch[3].padStart(2, '0')}:${(endMatch[4] || '00').padStart(2, '0')}`
      : '18:00';

    return {
      nome: parts[1] || '',
      negocio: parts[2] || '',
      servicos: parts[3] || '',
      horario_inicio: start,
      horario_fim: end,
    };
  }
}
