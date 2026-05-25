import type { ActivationCode, User } from '../../shared/types/index.js';

export interface ActivationRepository {
  createCode(code: string, plan: string, paymentId: string, expiresAt: Date): Promise<ActivationCode>;
  findValidCode(code: string): Promise<ActivationCode | null>;
  markUsed(code: string, userId: string): Promise<void>;
}

export interface UserRepository {
  findByPhone(phone: string): Promise<User | null>;
  findById(userId: string): Promise<User | null>;
  create(data: Partial<User>): Promise<User>;
  listAll(): Promise<User[]>;
}
