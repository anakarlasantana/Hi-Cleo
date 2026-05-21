export interface PlanLimit {
  id: string;
  plan_name: string;
  max_users: number;
  created_at: string;
}

export interface PlanRepository {
  getPlanLimit(planName: string): Promise<PlanLimit | null>;
  getAllPlanLimits(): Promise<PlanLimit[]>;
  countActiveUsers(userId: string): Promise<number>;
  getUserPlan(userId: string): Promise<string | null>;
  disconnectExcessUsers(userId: string, maxUsers: number): Promise<number>;
}
