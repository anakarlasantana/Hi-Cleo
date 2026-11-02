export interface SessionRepository {
  findByInstance(instanceName: string): Promise<{ user_id: string } | null>;
  findByUserId(userId: string): Promise<{ instance_name: string; user_id: string } | null>;
  listActiveSessions(): Promise<Array<{ user_id: string; instance_name: string }>>;
  /**
   * Marca a instância como conectada e vincula ao usuário.
   * Idempotente: chamado tanto pelo webhook (`connection.update`) quanto pelo
   * SSE do QR Code — o primeiro que chegar grava, o segundo não duplica.
   */
  activateSession(params: { userId: string; instanceName: string }): Promise<void>;
  markDisconnected(instanceName: string): Promise<void>;
}
