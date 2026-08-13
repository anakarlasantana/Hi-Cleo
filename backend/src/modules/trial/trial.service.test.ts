import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrialService } from './trial.service.js';

function createMockTrialRepo() {
  return {
    create: vi.fn().mockResolvedValue({ id: 'attempt-123', name: 'João', phone: '5511999887766', status: 'started' }),
    findByPhone: vi.fn().mockResolvedValue(null),
    findRecentByPhone: vi.fn().mockResolvedValue(null),
    findRecentByIp: vi.fn().mockResolvedValue(0),
    findByDeviceFingerprint: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updateProspectionStatus: vi.fn().mockResolvedValue(undefined),
    linkUser: vi.fn().mockResolvedValue(undefined),
    incrementResponses: vi.fn().mockResolvedValue(1),
  };
}

function createMockUserRepo() {
  return {
    findByPhone: vi.fn().mockResolvedValue(null),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'user-456', name: 'João', phone: '5511999887766', plan: 'solo' }),
    complementUser: vi.fn(),
    createBusiness: vi.fn(),
    getBusiness: vi.fn(),
    listAll: vi.fn(),
  };
}

function createMockActivationService() {
  return {
    generateCode: vi.fn().mockResolvedValue({ id: 'code-789', code: 'ATIVAR-ABCD' }),
    validateCode: vi.fn(),
    activateUser: vi.fn(),
  };
}

describe('TrialService', () => {
  let trialRepo: ReturnType<typeof createMockTrialRepo>;
  let userRepo: ReturnType<typeof createMockUserRepo>;
  let activationService: ReturnType<typeof createMockActivationService>;
  let service: TrialService;

  beforeEach(() => {
    trialRepo = createMockTrialRepo();
    userRepo = createMockUserRepo();
    activationService = createMockActivationService();
    service = new TrialService(trialRepo as any, userRepo as any, activationService as any);
  });

  describe('startTrial', () => {
    it('should create trial successfully with valid phone', async () => {
      const result = await service.startTrial({
        name: 'João',
        phone: '5511999887766',
        ipAddress: '192.168.1.1',
      });

      expect(result.success).toBe(true);
      expect(result.activationCode).toBe('ATIVAR-ABCD');
      expect(result.trialAttemptId).toBe('attempt-123');
      expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'João',
        phone: '5511999887766',
        plan: 'solo',
        subscription_status: 'trial',
      }));
      expect(trialRepo.linkUser).toHaveBeenCalledWith('attempt-123', 'user-456');
      expect(activationService.generateCode).toHaveBeenCalledWith('trial_free', 'solo', 'user-456');
    });

    it('should accept phone without country code and normalize', async () => {
      const result = await service.startTrial({
        name: 'Maria',
        phone: '11999887766',
      });

      expect(result.success).toBe(true);
      expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        phone: '5511999887766',
      }));
    });

    it('should reject invalid phone (not brazilian)', async () => {
      const result = await service.startTrial({
        name: 'Test',
        phone: '1234567',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Telefone inválido');
      expect(result.blockedReason).toBe('invalid_phone');
      expect(userRepo.create).not.toHaveBeenCalled();
    });

    it('should reject phone without 9 prefix (landline)', async () => {
      const result = await service.startTrial({
        name: 'Test',
        phone: '5511345678901',
      });

      expect(result.success).toBe(false);
      expect(result.blockedReason).toBe('invalid_phone');
    });

    it('should block duplicate phone within 90 days', async () => {
      trialRepo.findRecentByPhone.mockResolvedValue({ id: 'old-attempt', phone: '5511999887766', status: 'expired' });

      const result = await service.startTrial({
        name: 'João',
        phone: '5511999887766',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('já utilizou');
      expect(result.blockedReason).toBe('duplicate_phone');
      expect(userRepo.create).not.toHaveBeenCalled();
    });

    it('should block when IP exceeds rate limit (3 in 24h)', async () => {
      trialRepo.findRecentByIp.mockResolvedValue(3);

      const result = await service.startTrial({
        name: 'Bot',
        phone: '5521988776655',
        ipAddress: '10.0.0.1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Muitas tentativas');
      expect(result.blockedReason).toBe('rate_limit_ip');
    });

    it('should block when phone already has a user account', async () => {
      userRepo.findByPhone.mockResolvedValue({ id: 'existing-user', phone: '5511999887766' });

      const result = await service.startTrial({
        name: 'João',
        phone: '5511999887766',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('já possui uma conta');
      expect(result.blockedReason).toBe('existing_user');
    });
  });

  describe('checkTrialStatus', () => {
    it('should return valid for non-trial users', () => {
      const result = service.checkTrialStatus({ subscription_status: 'active' });
      expect(result.isValid).toBe(true);
    });

    it('should return valid for trial with remaining responses', () => {
      const result = service.checkTrialStatus({
        subscription_status: 'trial',
        subscription_expires_at: new Date(Date.now() + 86400000).toISOString(), // +1 day
        trial_responses_used: 10,
        trial_responses_limit: 30,
      });

      expect(result.isValid).toBe(true);
      expect(result.responsesUsed).toBe(10);
      expect(result.responsesLimit).toBe(30);
    });

    it('should return expired for trial past expiration date', () => {
      const result = service.checkTrialStatus({
        subscription_status: 'trial',
        subscription_expires_at: new Date(Date.now() - 86400000).toISOString(), // -1 day
        trial_responses_used: 5,
        trial_responses_limit: 30,
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('should return limit_reached when responses exhausted', () => {
      const result = service.checkTrialStatus({
        subscription_status: 'trial',
        subscription_expires_at: new Date(Date.now() + 86400000).toISOString(),
        trial_responses_used: 30,
        trial_responses_limit: 30,
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('limit_reached');
      expect(result.responsesUsed).toBe(30);
      expect(result.responsesLimit).toBe(30);
    });

    it('should use default limit of 30 when not specified', () => {
      const result = service.checkTrialStatus({
        subscription_status: 'trial',
        subscription_expires_at: new Date(Date.now() + 86400000).toISOString(),
        trial_responses_used: 30,
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('limit_reached');
    });
  });
});
