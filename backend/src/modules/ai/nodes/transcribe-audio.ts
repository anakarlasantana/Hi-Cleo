import { env } from '../../../shared/config/env.js';
import { createLogger } from '../../../shared/logger/logger.js';

const log = createLogger().child({ module: 'transcribe-audio' });

export interface TranscribeOptions {
  phone: string;
  /** Objeto `data.key` do webhook (contém remoteJid, fromMe, id) */
  messageKey?: { remoteJid?: string; fromMe?: boolean; id?: string };
  /** Objeto `data.message` do webhook (contém audioMessage com mediaKey) */
  rawMessage?: Record<string, unknown>;
  /** Duração do áudio em segundos (do audioMessage.seconds) */
  durationSeconds?: number;
}

/**
 * Transcreve áudio usando Groq Whisper.
 *
 * Recebe o key e message separados do webhook para montar o payload correto
 * para a API getBase64FromMediaMessage da Evolution.
 *
 * No LangGraph futuro, será o nó `transcribe` que antecede qualquer nó de interpretação.
 */
export async function transcribeAudio(
  phone: string,
  rawWebhookMessage?: Record<string, unknown>,
  messageKey?: { remoteJid?: string; fromMe?: boolean; id?: string },
  durationSeconds?: number,
): Promise<string | null> {
  try {
    if (!env.GROQ_API_KEY) {
      log.warn('GROQ_API_KEY não configurada, transcrição desabilitada');
      return null;
    }
    if (!rawWebhookMessage) {
      log.warn({ phone: phone.slice(0, 4) + '****' }, 'rawWebhookMessage ausente, impossível transcrever');
      return null;
    }

    // Log informativo para áudios longos (>5 min)
    if (durationSeconds && durationSeconds > 300) {
      log.info({ phone: phone.slice(0, 4) + '****', durationSeconds }, 'áudio longo detectado, transcrição pode demorar');
    }

    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: env.GROQ_API_KEY });

    const evolutionUrl = env.EVOLUTION_API_URL;
    const evolutionKey = env.EVOLUTION_API_KEY;
    const instance = env.MONITOR_INSTANCE;

    // Montar payload para getBase64FromMediaMessage
    // A Evolution precisa do key real (com id da mensagem) + message com mediaKey
    const messagePayload = {
      key: {
        remoteJid: messageKey?.remoteJid || `${phone}@s.whatsapp.net`,
        fromMe: messageKey?.fromMe ?? false,
        id: messageKey?.id || '',
      },
      message: rawWebhookMessage,
    };

    // Baixar áudio decodificado em base64 via Evolution
    const mediaResponse = await fetch(
      `${evolutionUrl}/chat/getBase64FromMediaMessage/${instance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
        body: JSON.stringify({ message: messagePayload }),
      },
    );

    if (!mediaResponse.ok) {
      log.error({ phone: phone.slice(0, 4) + '****', status: mediaResponse.status }, 'Evolution getBase64FromMediaMessage falhou');
      return null;
    }

    const mediaData = await mediaResponse.json() as { base64?: string; mimetype?: string };
    if (!mediaData?.base64) {
      log.warn({ phone: phone.slice(0, 4) + '****' }, 'Evolution retornou sem base64');
      return null;
    }

    // Converter base64 para File e transcrever via Whisper
    const audioBuffer = Buffer.from(mediaData.base64, 'base64');
    const audioFile = new File([audioBuffer], 'audio.ogg', { type: mediaData.mimetype || 'audio/ogg' });

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      language: 'pt',
    });

    const result = transcription.text?.trim() || null;

    if (result) {
      log.info({ phone: phone.slice(0, 4) + '****', textLength: result.length, durationSeconds }, 'áudio transcrito com sucesso');
    }

    return result;
  } catch (error) {
    log.error({ err: error, phone: phone.slice(0, 4) + '****' }, 'erro na transcrição de áudio');
    return null;
  }
}
