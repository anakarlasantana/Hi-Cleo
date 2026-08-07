import { env } from '../../../shared/config/env.js';

/**
 * Transcreve áudio usando Groq Whisper.
 * Função pura: recebe phone → busca áudio na Evolution → transcreve → retorna texto.
 *
 * No LangGraph futuro, será o nó `transcribe` que antecede qualquer nó de interpretação.
 */
export async function transcribeAudio(phone: string): Promise<string | null> {
  try {
    if (!env.GROQ_API_KEY) return null;

    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: env.GROQ_API_KEY });

    const evolutionUrl = env.EVOLUTION_API_URL;
    const evolutionKey = env.EVOLUTION_API_KEY;
    const instance = env.MONITOR_INSTANCE;

    // Buscar última mensagem recebida (contém o áudio) via Evolution
    const messagesResponse = await fetch(
      `${evolutionUrl}/chat/findMessages/${instance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
        body: JSON.stringify({
          where: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false } },
          limit: 1,
        }),
      },
    );

    if (!messagesResponse.ok) return null;

    const messages = await messagesResponse.json() as any[];
    const lastMessage = messages?.[0];
    if (!lastMessage?.key?.id) return null;

    // Baixar áudio em base64 via Evolution
    const mediaResponse = await fetch(
      `${evolutionUrl}/chat/getBase64FromMediaMessage/${instance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
        body: JSON.stringify({ message: lastMessage }),
      },
    );

    if (!mediaResponse.ok) return null;

    const mediaData = await mediaResponse.json() as { base64: string; mimetype: string };
    if (!mediaData?.base64) return null;

    // Converter base64 para File e transcrever
    const audioBuffer = Buffer.from(mediaData.base64, 'base64');
    const audioFile = new File([audioBuffer], 'audio.ogg', { type: mediaData.mimetype || 'audio/ogg' });

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      language: 'pt',
    });

    return transcription.text?.trim() || null;
  } catch {
    return null;
  }
}
