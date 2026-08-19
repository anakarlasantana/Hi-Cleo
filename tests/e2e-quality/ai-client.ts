/**
 * Cliente de IA para o teste E2E.
 * Segue o padrão do AiPort mas com max_tokens maior (respostas longas do judge).
 */

import axios from 'axios';
import Groq from 'groq-sdk';
import { config } from './config.js';

export interface AiClient {
  generate(system: string, user: string): Promise<string>;
}

/** DeepSeek — barato, bom em português */
function createDeepSeekClient(): AiClient {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY não configurada');

  return {
    async generate(system, user) {
      const response = await axios.post(
        'https://api.deepseek.com/chat/completions',
        {
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.4,
          max_tokens: 2000,
        },
        {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          timeout: 60_000,
        },
      );
      return response.data.choices[0]?.message?.content?.trim() || '';
    },
  };
}

/** Groq — rápido, free tier generoso */
function createGroqClient(): AiClient {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada');

  const client = new Groq({ apiKey });
  return {
    async generate(system, user) {
      const response = await client.chat.completions.create({
        model: 'qwen/qwen3.6-27b',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 4000,
      });
      return response.choices[0]?.message?.content?.trim() || '';
    },
  };
}

/** Gemini — último recurso */
function createGeminiClient(): AiClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

  return {
    async generate(system, user) {
      // Usa REST direto (evita depender de @google/generative-ai no teste)
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
        },
        { timeout: 60_000 },
      );
      return response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    },
  };
}

/** Factory — cria o client correto baseado na config */
export function createAiClient(): AiClient {
  switch (config.aiProvider) {
    case 'deepseek': return createDeepSeekClient();
    case 'groq': return createGroqClient();
    case 'gemini': return createGeminiClient();
    default: return createDeepSeekClient();
  }
}
