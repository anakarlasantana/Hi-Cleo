import { createPersonaClient } from './ai-client.js';
import { generateFirstMessage } from './autonomous-user.js';

async function main() {
  const persona = {
    id: 'test', name: 'Ricardo Silva', age: 34, phone: '5511999990001',
    scenario: 'client_message' as const,
    description: 'Cliente de barbearia, quer preco do corte.',
  };
  const ai = createPersonaClient();
  console.time('generateFirstMessage');
  const msg = await generateFirstMessage(ai, persona);
  console.timeEnd('generateFirstMessage');
  console.log('MSG:', JSON.stringify(msg));
}
main().then(() => process.exit(0)).catch(e => { console.error('ERR:', e.message); process.exit(1); });
