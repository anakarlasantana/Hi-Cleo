export interface ExclusionRepository {
  isExcluded(userId: string, phone: string): Promise<boolean>;
  add(userId: string, phone: string, nome?: string): Promise<void>;
  remove(userId: string, phone: string): Promise<void>;
  list(userId: string): Promise<Array<{ telefone: string; nome: string }>>;
}
