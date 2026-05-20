export interface AiPort {
  generateContent(prompts: string[]): Promise<string>;
}
