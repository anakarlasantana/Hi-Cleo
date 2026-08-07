// Estado
export type { ConversationState, InterpretedResponse } from './state.js';

// Nós (funções puras — futuros nós LangGraph)
export { interpretOnboardingResponse } from './nodes/interpret-onboarding.js';
export { transcribeAudio } from './nodes/transcribe-audio.js';
export { interpretConfirmation } from './nodes/interpret-confirmation.js';
export { generateClientReply } from './nodes/generate-client-reply.js';
export { recognizeIntent } from './nodes/recognize-intent.js';
export type { BusinessContext } from './nodes/generate-client-reply.js';

// Prompts
export { ONBOARDING_PROMPTS, ONBOARDING_RETRY_MESSAGES } from './prompts/onboarding.prompts.js';
export { INTENT_PROMPT } from './prompts/intent.prompts.js';
export { CLIENT_REPLY_PROMPT } from './prompts/client-reply.prompts.js';
export { CONFIRMATION_PROMPT } from './prompts/terms.prompts.js';

// Adapters
export { GeminiAdapter } from './adapters/gemini.adapter.js';
export { GroqAdapter } from './adapters/groq.adapter.js';
export { AiFallbackAdapter } from './adapters/ai-fallback.adapter.js';
