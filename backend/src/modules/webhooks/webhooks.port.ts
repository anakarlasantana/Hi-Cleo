export interface SessionRepository {
  findByInstance(instanceName: string): Promise<{ user_id: string } | null>;
  findByUserId(userId: string): Promise<{ instance_name: string; user_id: string } | null>;
  listActiveSessions(): Promise<Array<{ user_id: string; instance_name: string }>>;
  markDisconnected(instanceName: string): Promise<void>;
}
