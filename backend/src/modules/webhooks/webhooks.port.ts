export interface SessionRepository {
  findByInstance(instanceName: string): Promise<{ user_id: string } | null>;
}
