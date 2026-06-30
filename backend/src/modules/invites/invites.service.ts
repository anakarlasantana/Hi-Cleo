import { randomUUID } from 'crypto';
import type { InviteRepository } from './invites.port.js';
import type { PlanService } from '../plans/plans.service.js';
import type { UserRepository } from '../activation/activation.port.js';
import type { Invite, User } from '../../shared/types/index.js';

const INVITE_EXPIRY_HOURS = 72;

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

    // Criar business profile independente
    await this.userRepo.createBusiness(collaborator.id, {
      name: collaboratorData.name,
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
    const { supabase } = await import('../../shared/config/supabase.js');

    const { data: collaborator } = await supabase
      .from('users')
      .select('id')
      .eq('phone', collaboratorPhone)
      .eq('owner_user_id', ownerUserId)
      .single();

    if (!collaborator) {
      throw new Error('COLLABORATOR_NOT_FOUND');
    }

    // Desconectar sessão ativa
    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
      .eq('user_id', collaborator.id)
      .eq('status', 'active');

    if (error) throw new Error(`Erro ao desconectar: ${error.message}`);
  }
}
