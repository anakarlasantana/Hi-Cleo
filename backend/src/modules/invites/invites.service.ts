import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { users, whatsappSessions } from '../../shared/schema.js';
import type { InviteRepository } from './invites.port.js';
import type { PlanService } from '../plans/plans.service.js';
import type { UserRepository } from '../activation/activation.port.js';
import type { Invite, User } from '../../shared/types/index.js';

const INVITE_EXPIRY_HOURS = 72;

export interface CollaborateProfile {
  name: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  termsAccepted: boolean;
  /** Opcionais — completam o perfil para a Cleo responder de forma contextual. */
  businessType?: string;
  targetAudience?: string;
  toneOfVoice?: 'formal' | 'friendly_professional' | 'casual';
}

function generateInviteToken(): string {
  return randomUUID().replace(/-/g, '').substring(0, 24);
}

export class InviteService {
  constructor(
    private inviteRepo: InviteRepository,
    private planService: PlanService,
    private userRepo: UserRepository,
  ) {}

  /**
   * Cria convite para colaborador. Verifica subscription ativa e slots disponíveis.
   */
  async createInvite(ownerUserId: string, collaboratorPhone: string): Promise<Invite> {
    // Verificar que owner tem subscription ativa
    const owner = await this.userRepo.findById(ownerUserId);
    if (!owner || owner.subscription_status !== 'active') {
      throw new Error('SUBSCRIPTION_INACTIVE');
    }

    // Verificar slots disponíveis
    const canAdd = await this.planService.canAddUser(ownerUserId);
    if (!canAdd) {
      throw new Error('NO_SLOTS_AVAILABLE');
    }

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

    return this.inviteRepo.create({
      ownerUserId,
      phone: collaboratorPhone,
      token,
      expiresAt,
    });
  }

  /**
   * Busca o convite pelo token (sem validar expiração/slots).
   * Usado pelo SSE de conexão, que precisa do colaborador já vinculado.
   */
  async findByToken(token: string): Promise<Invite | null> {
    return this.inviteRepo.findByToken(token);
  }

  /**
   * Valida um token de convite. Verifica status, expiração, subscription do owner e slots.
   */
  async validateInvite(token: string): Promise<{ valid: boolean; invite: Invite | null; error?: string }> {
    const invite = await this.inviteRepo.findByToken(token);

    if (!invite) {
      return { valid: false, invite: null, error: 'TOKEN_NOT_FOUND' };
    }

    if (invite.status !== 'pending') {
      return { valid: false, invite, error: 'TOKEN_ALREADY_USED' };
    }

    if (new Date(invite.expires_at) < new Date()) {
      return { valid: false, invite, error: 'TOKEN_EXPIRED' };
    }

    // Verificar subscription do owner
    const owner = await this.userRepo.findById(invite.owner_user_id);
    if (!owner || owner.subscription_status !== 'active') {
      return { valid: false, invite, error: 'OWNER_SUBSCRIPTION_INACTIVE' };
    }

    // Verificar slots disponíveis
    const canAdd = await this.planService.canAddUser(invite.owner_user_id);
    if (!canAdd) {
      return { valid: false, invite, error: 'NO_SLOTS_AVAILABLE' };
    }

    return { valid: true, invite };
  }

  /**
   * Aceita convite: cria user colaborador com business profile independente.
   */
  async acceptInvite(token: string, collaboratorData: {
    name: string;
    businessHoursStart: string;
    businessHoursEnd: string;
    termsAccepted: boolean;
    businessType?: string;
    targetAudience?: string;
    toneOfVoice?: 'formal' | 'friendly_professional' | 'casual';
  }): Promise<User> {
    if (!collaboratorData.termsAccepted) {
      throw new Error('TERMS_CONSENT_REQUIRED');
    }

    const validation = await this.validateInvite(token);
    if (!validation.valid || !validation.invite) {
      throw new Error(validation.error || 'INVALID_INVITE');
    }

    const invite = validation.invite;

    // Criar user colaborador
    const collaborator = await this.userRepo.create({
      name: collaboratorData.name,
      phone: invite.phone,
      plan: 'solo', // Colaborador herda acesso via owner, não tem plano próprio
      owner_user_id: invite.owner_user_id,
      subscription_status: 'active',
    });

    // Criar business profile independente.
    // A Cleo gera respostas a partir deste perfil: sem tipo de negócio e tom de
    // voz o colaborador recebia respostas genéricas (o onboarding pesado do dono
    // não roda para colaboradores).
    await this.userRepo.createBusiness(collaborator.id, {
      name: collaboratorData.businessType || collaboratorData.name,
      services: collaboratorData.businessType,
      target_audience: collaboratorData.targetAudience,
      tone_of_voice: collaboratorData.toneOfVoice ?? 'friendly_professional',
      business_hours_start: collaboratorData.businessHoursStart,
      business_hours_end: collaboratorData.businessHoursEnd,
    });

    // Marcar convite como aceito
    await this.inviteRepo.markAccepted(token, collaborator.id);

    return collaborator;
  }

  /**
   * Desconecta colaborador e libera slot do owner.
   */
  async disconnectCollaborator(ownerUserId: string, collaboratorPhone: string): Promise<void> {
    // Buscar user colaborador pelo phone e owner_user_id
    const [collaborator] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, collaboratorPhone), eq(users.ownerUserId, ownerUserId)))
      .limit(1);

    if (!collaborator) {
      throw new Error('COLLABORATOR_NOT_FOUND');
    }

    // Desconectar sessão ativa
    await db.update(whatsappSessions)
      .set({ status: 'disconnected', disconnectedAt: new Date() })
      .where(and(eq(whatsappSessions.userId, collaborator.id), eq(whatsappSessions.status, 'active')));
  }
}
