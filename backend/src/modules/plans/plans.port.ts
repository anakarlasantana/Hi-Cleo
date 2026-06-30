export interface PlanLimit {
  id: string;
  plan_name: string;
  display_name: string;
  description: string;
  max_users: number;
  price_monthly: number;
  price_yearly_total: number;
  features: string[];
  highlighted: boolean;
  created_at: string;
}

export interface PlanRepository {
  getPlanLimit(planName: string): Promise<PlanLimit | null>;
  getAllPlanLimits(): Promise<PlanLimit[]>;
  countActiveUsers(userId: string): Promise<number>;
  getUserPlan(userId: string): Promise<string | null>;
  getUserMaxConnections(userId: string): Promise<number>;
  disconnectExcessUsers(userId: string, maxUsers: number): Promise<number>;
}
