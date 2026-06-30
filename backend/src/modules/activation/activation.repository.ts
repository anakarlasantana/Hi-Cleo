import { supabase } from "../../shared/config/supabase.js";
import type {
  ActivationRepository,
  UserRepository,
} from "./activation.port.js";
import type { ActivationCode, User, Business } from "../../shared/types/index.js";

export class SupabaseActivationRepository implements ActivationRepository {
  async createCode(
    code: string,
    plan: string,
    paymentId: string,
    expiresAt: Date,
    userId?: string,
    userEmail?: string,
  ): Promise<ActivationCode> {
    const insertData: Record<string, unknown> = {
      code,
      plan,
      payment_id: paymentId,
      used: false,
      expires_at: expiresAt.toISOString(),
    };

    if (userId) insertData.user_id = userId;
    if (userEmail) insertData.user_email = userEmail;

    const { data, error } = await supabase
      .from("activation_codes")
      .insert(insertData)
      .select()
      .single();

    if (error) throw new Error(`Erro ao gerar código: ${error.message}`);
    return data as ActivationCode;
  }

  async findValidCode(code: string): Promise<ActivationCode | null> {
    const { data } = await supabase
      .from("activation_codes")
      .select("*")
      .eq("code", code.toUpperCase())
      .eq("used", false)
      .single();

    if (!data) return null;
    if (new Date(data.expires_at) < new Date()) return null;

    return data as ActivationCode;
  }

  async findCodeByValue(code: string): Promise<ActivationCode | null> {
    const { data } = await supabase
      .from("activation_codes")
      .select("*")
      .eq("code", code.toUpperCase())
      .single();

    if (!data) return null;
    return data as ActivationCode;
  }

  async findByUserId(userId: string): Promise<ActivationCode | null> {
    const { data } = await supabase
      .from("activation_codes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return (data as ActivationCode) || null;
  }

  async markUsed(code: string, userId: string): Promise<void> {
    await supabase
      .from("activation_codes")
      .update({ used: true, used_by: userId, activated_at: new Date().toISOString() })
      .eq("code", code.toUpperCase());
  }
}

export class SupabaseUserRepository implements UserRepository {
  async findByPhone(phone: string): Promise<User | null> {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone)
      .single();

    return (data as User) || null;
  }

  async findById(userId: string): Promise<User | null> {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    return (data as User) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    return (data as User) || null;
  }

  async create(userData: Partial<User>): Promise<User> {
    const { data, error } = await supabase
      .from("users")
      .insert(userData)
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar usuário: ${error.message}`);
    return data as User;
  }

  async complementUser(userId: string, complementData: { phone: string; name: string }): Promise<User> {
    const { data, error } = await supabase
      .from("users")
      .update(complementData)
      .eq("id", userId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao complementar usuário: ${error.message}`);
    return data as User;
  }

  async listAll(): Promise<User[]> {
    const { data } = await supabase.from("users").select("*");
    return (data || []) as User[];
  }

  async createBusiness(
    userId: string,
    businessData: {
      name?: string;
      services?: string;
      business_hours_start?: string;
      business_hours_end?: string;
    },
  ): Promise<void> {
    await supabase.from("businesses").insert({
      user_id: userId,
      ...businessData,
    });
  }

  async getBusiness(userId: string): Promise<Business | null> {
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .single();

    return (data as Business) || null;
  }
}
