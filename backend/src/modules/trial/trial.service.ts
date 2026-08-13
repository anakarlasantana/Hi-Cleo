import type { TrialRepository, TrialAttempt } from './trial.port.js';
import type { UserRepository } from '../activation/activation.port.js';
import type { ActivationService } from '../activation/activation.service.js';

const TRIAL_DURATION_DAYS = 7;
const TRIAL_COOLDOWN_DAYS = 90;
const MAX_TRIALS_PER_IP_24H = 3;
const TRIAL_RESPONSES_LIMIT = 30;

/** Valida telefone brasileiro: +55 + DDD (2 dígitos) + 9 + 8 dígitos */
function isValidBrazilianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  // 55 + DDD(2) + 9 + 8 dígitos = 13 dígitos
  if (cleaned.length !== 13) return false;
  if (!cleaned.startsWith('55')) return false;

  const ddd = parseInt(cleaned.substring(2, 4));
  if (ddd < 11 || ddd > 99) return false;

  // Celular começa com 9
  if (cleaned[4] !== '9') return false;

  return true;
}

/** Normaliza telefone para formato +55XXXXXXXXXXX */
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('55')) return cleaned;
  return `55${cleaned}`;
}

interface StartTrialParams {
  name: string;
  phone: string;
  ipAddress?: string;
  userAgent?: string;
}

interface StartTrialResult {
  success: boolean;
  activationCode?: string;
  trialAttemptId?: string;
  error?: string;
  blockedReason?: string;
}

export class TrialService {
  constructor(
    private trialRepo: TrialRepository,
    private userRepo: UserRepository,
    private activationService: ActivationService,
  ) {}

  async startTrial(params: StartTrialParams): Promise<StartTrialResult> {
    const { name, ipAddress, userAgent } = params;
    const phone = normalizePhone(params.phone);

    // === CAMADA 1: Validar telefone brasileiro ===
    if (!isValidBrazilianPhone(phone)) {
      return { success: false, error: 'Telefone inválido. Use um celular brasileiro com DDD.', blockedReason: 'invalid_phone' };
    }

    // === CAMADA 2: Cooldown por telefone (90 dias) ===
    const existingTrial = await this.trialRepo.findRecentByPhone(phone, TRIAL_COOLDOWN_DAYS);
    if (existingTrial) {
      // Registrar tentativa bloqueada
      await this.trialRepo.create({ name, phone, ip_address: ipAddress, user_agent: userAgent });
      await this.blockLastAttempt(phone, 'duplicate_phone');
      return { success: false, error: 'Este número já utilizou o período de teste.', blockedReason: 'duplicate_phone' };
    }

    // === CAMADA 3: Rate limit por IP (max 3 em 24h) ===
    if (ipAddress) {
      const recentFromIp = await this.trialRepo.findRecentByIp(ipAddress, 24);
      if (recentFromIp >= MAX_TRIALS_PER_IP_24H) {
        await this.trialRepo.create({ name, phone, ip_address: ipAddress, user_agent: userAgent });
        await this.blockLastAttempt(phone, 'rate_limit_ip');
        return { success: false, error: 'Muitas tentativas. Tente novamente amanhã.', blockedReason: 'rate_limit_ip' };
      }
    }

    // === CAMADA 4: Verificar se já existe user com esse telefone ===
    const existingUser = await this.userRepo.findByPhone(phone);
    if (existingUser) {
      return { success: false, error: 'Este número já possui uma conta. Faça login ou assine um plano.', blockedReason: 'existing_user' };
    }

    // === TODAS AS VALIDAÇÕES PASSARAM — Criar trial ===

    // 1. Registrar tentativa
    const attempt = await this.trialRepo.create({ name, phone, ip_address: ipAddress, user_agent: userAgent });

    // 2. Criar user com subscription trial
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + TRIAL_DURATION_DAYS);

    const user = await this.userRepo.create({
      name,
      phone,
      plan: 'solo',
      subscription_status: 'trial',
      subscription_started_at: now.toISOString(),
      subscription_expires_at: expiresAt.toISOString(),
      trial_started_at: now.toISOString(),
      trial_responses_used: 0,
      trial_responses_limit: TRIAL_RESPONSES_LIMIT,
      trial_attempt_id: attempt.id,
    } as any);

    // 3. Vincular user ao trial attempt
    await this.trialRepo.linkUser(attempt.id, user.id);

    // 4. Gerar código de ativação
    const code = await this.activationService.generateCode('trial_free', 'solo', user.id);

    return {
      success: true,
      activationCode: code.code,
      trialAttemptId: attempt.id,
    };
  }

  /** Verifica se o user está em trial válido e tem respostas disponíveis */
  checkTrialStatus(user: { subscription_status?: string; subscription_expires_at?: string; trial_responses_used?: number; trial_responses_limit?: number }): {
    isValid: boolean;
    reason?: 'expired' | 'limit_reached';
    responsesUsed?: number;
    responsesLimit?: number;
  } {
    if (user.subscription_status !== 'trial') {
      return { isValid: true }; // Não é trial, não aplicar restrições
    }

    // Verificar expiração
    if (user.subscription_expires_at && new Date() > new Date(user.subscription_expires_at)) {
      return { isValid: false, reason: 'expired' };
    }

    // Verificar limite de respostas
    const used = user.trial_responses_used || 0;
    const limit = user.trial_responses_limit || TRIAL_RESPONSES_LIMIT;

    if (used >= limit) {
      return { isValid: false, reason: 'limit_reached', responsesUsed: used, responsesLimit: limit };
    }

    return { isValid: true, responsesUsed: used, responsesLimit: limit };
  }

  private async blockLastAttempt(phone: string, reason: string): Promise<void> {
    const attempt = await this.trialRepo.findByPhone(phone);
    if (attempt) {
      await this.trialRepo.updateStatus(attempt.id, 'blocked', { blocked_reason: reason });
    }
  }
}
