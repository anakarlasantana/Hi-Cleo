import type { ActivationCode, User, Business } from '../../shared/types/index.js';

export interface ActivationRepository {
  createCode(code: string, plan: string, paymentId: string, expiresAt: Date, userId?: string, userEmail?: string): Promise<ActivationCode>;
  findValidCode(code: string): Promise<ActivationCode | null>;
  findCodeByValue(code: string): Promise<ActivationCode | null>;
  findByUserId(userId: string): Promise<ActivationCode | null>;
  markUsed(code: string, userId: string): Promise<void>;
}

export interface UserRepository {
  findByPhone(phone: string): Promise<User | null>;
  findById(userId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: Partial<User>): Promise<User>;
  complementUser(userId: string, data: { phone: string; name: string }): Promise<User>;
  createBusiness(userId: string, data: {
    name?: string;
    services?: string;
    target_audience?: string;
    tone_of_voice?: string;
    business_hours_start?: string;
    business_hours_end?: string;
  }): Promise<void>;
  getBusiness(userId: string): Promise<Business | null>;
  listAll(): Promise<User[]>;
}
