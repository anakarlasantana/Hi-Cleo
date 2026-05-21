export interface SystemMetrics {
  totalContacts: number;
  avgPerUser: number;
  maxPerUser: number;
}

export interface ContactMonitorRepository {
  getContactCount(userId: string): Promise<number>;
  getTotalContacts(): Promise<number>;
  getContactCountPerUser(): Promise<Array<{ userId: string; count: number }>>;
}
