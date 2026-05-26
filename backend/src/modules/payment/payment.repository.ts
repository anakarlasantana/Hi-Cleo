import { supabase } from '../../shared/config/supabase.js';
import type { PaymentRepository, PaymentRecord, PaymentStatus } from './payment.port.js';

export class SupabasePaymentRepository implements PaymentRepository {
  async create(record: Omit<PaymentRecord, 'id' | 'created_at' | 'updated_at'>): Promise<PaymentRecord> {
    const { data, error } = await supabase.from('payments').insert(record).select().single();
    if (error) throw new Error(`Erro ao criar pagamento: ${error.message}`);
    return data as PaymentRecord;
  }

  async findByExternalOrderId(orderId: string): Promise<PaymentRecord | null> {
    const { data } = await supabase.from('payments').select('*').eq('external_order_id', orderId).single();
    return (data as PaymentRecord) || null;
  }

  async updateStatus(id: string, status: PaymentStatus, externalPaymentId?: string): Promise<void> {
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (externalPaymentId) update.external_payment_id = externalPaymentId;
    const { error } = await supabase.from('payments').update(update).eq('id', id);
    if (error) throw new Error(`Erro ao atualizar status: ${error.message}`);
  }

  async linkActivationCode(id: string, activationCodeId: string): Promise<void> {
    const { error } = await supabase.from('payments').update({ activation_code_id: activationCodeId, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(`Erro ao vincular código: ${error.message}`);
  }
}
