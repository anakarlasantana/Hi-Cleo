import { supabase } from '../../shared/config/supabase.js';
import type { ActivationRepository, UserRepository } from './activation.port.js';
import type { ActivationCode, User } from '../../shared/types/index.js';

export class SupabaseActivationRepository implements ActivationRepository {
  async createCode(code: string, plano: string, paymentId: string, expiresAt: Date): Promise<ActivationCode> {
    const { data, error } = await supabase
      .from('activation_codes')
      .insert({
        code,
        plano,
        payment_id: paymentId,
        used: false,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao gerar código: ${error.message}`);
    return data as ActivationCode;
  }

  async findValidCode(code: string): Promise<ActivationCode | null> {
    const { data } = await supabase
      .from('activation_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('used', false)
      .single();

    if (!data) return null;
    if (new Date(data.expires_at) < new Date()) return null;

    return data as ActivationCode;
  }

  async markUsed(code: string, userId: string): Promise<void> {
    await supabase
      .from('activation_codes')
      .update({ used: true, used_by: userId })
      .eq('code', code.toUpperCase());
  }
}

export class SupabaseUserRepository implements UserRepository {
  async findByPhone(phone: string): Promise<User | null> {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('telefone', phone)
      .single();

    return (data as User) || null;
  }

  async findById(userId: string): Promise<User | null> {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    return (data as User) || null;
  }

  async create(userData: Partial<User>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar usuário: ${error.message}`);
    return data as User;
  }

  async listAll(): Promise<User[]> {
    const { data } = await supabase.from('users').select('*');
    return (data || []) as User[];
  }
}
