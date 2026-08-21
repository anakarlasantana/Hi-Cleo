/**
 * Clientes de IA para o teste E2E.
 *
 * Suporta providers separados por papel:
 * - Persona Simulator → Ollama local (default, grátis, sem rate limit)
 * - Judge/Evaluator → Ollama local (default)
 * - Fallback → DeepSeek, Groq, Gemini (APIs externas)
 *
 * A Cleo usa o provider real configurado no backend — não passa por aqui.
 */

import axios from 'axios';
import Groq from 'groq-sdk';
import { config } from './config.js';

export interface AiClient {
  generate(system: string, user: string): Promise<string>;
}

type Provider = 'ollama' | 'deepseek' | 'groq' | 'gemini';

// ─── Ollama (local, grátis, sem rate limit) ──────────────────────────────────

function createOllamaClient(options: {
  temperature: number;
  maxTokens: number;
}): AiClient {
  const { baseUrl, model, timeout } = config.ollama;

  return {
    async generate(system, user) {
      const response = await axios.post(
        `${baseUrl}/api/chat`,
        {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          stream: false,
          think: false,
          options: {
            temperature: options.temperature,
            num_predict: options.maxTokens,
          },
        },
        { timeout },
      );

      const content: string = response.data?.message?.content ?? '';

      // Remove thinking tags caso o modelo retorne mesmo com think:false
      return content
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim();
    },
  };
}

// ─── DeepSeek ────────────────────────────────────────────────────────────────

function createDeepSeekClient(options: {
  temperature: number;
  maxTokens: number;
}): AiClient {
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
          temperature: options.temperature,
          max_tokens: options.maxTokens,
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

// ─── Groq ────────────────────────────────────────────────────────────────────

function createGroqClient(options: {
  temperature: number;
  maxTokens: number;
}): AiClient {
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
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      });
      return response.choices[0]?.message?.content?.trim() || '';
    },
  };
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

function createGeminiClient(options: {
  temperature: number;
  maxTokens: number;
}): AiClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

  return {
    async generate(system, user) {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
          generationConfig: { temperature: options.temperature, maxOutputTokens: options.maxTokens },
        },
        { timeout: 60_000 },
      );
      return response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    },
  };
}

// ─── Factories ───────────────────────────────────────────────────────────────

function createClientForProvider(provider: Provider, options: {
  temperature: number;
  maxTokens: number;
}): AiClient {
  switch (provider) {
    case 'ollama': return createOllamaClient(options);
    case 'deepseek': return createDeepSeekClient(options);
    case 'groq': return createGroqClient(options);
    case 'gemini': return createGeminiClient(options);
    default: return createOllamaClient(options);
  }
}

/**
 * Cria client para o Simulador de Persona.
 * Default: Ollama local (grátis, sem rate limit, temperatura alta para variação).
 */
export function createPersonaClient(): AiClient {
  return createClientForProvider(config.personaProvider, {
    temperature: config.ollama.personaTemperature,
    maxTokens: config.ollama.personaMaxTokens,
  });
}

/**
 * Cria client para o Judge/Evaluator.
 * Default: Ollama local (grátis, temperatura baixa para consistência).
 */
export function createJudgeClient(): AiClient {
  return createClientForProvider(config.judgeProvider, {
    temperature: config.ollama.judgeTemperature,
    maxTokens: config.ollama.judgeMaxTokens,
  });
}

/**
 * Cria client genérico (compatibilidade com código existente).
 * Usa o aiProvider legado da config.
 */
export function createAiClient(): AiClient {
  return createClientForProvider(config.aiProvider, {
    temperature: 0.4,
    maxTokens: 2000,
  });
}
