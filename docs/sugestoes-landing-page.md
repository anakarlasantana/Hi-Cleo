# Sugestões de Melhoria — Landing Page Hi Cleo

## Problema Identificado

A landing page atual fala de forma genérica sobre "organizar clientes" e "não perder vendas". Funciona, mas não mostra como a Cleo se adapta a cada profissão. O público-alvo (professores, corretores, clínicas, consultores) não se vê refletido na página.

O visitante pensa: "Legal, mas isso serve pra mim que sou professor?" — e não encontra resposta.

---

## Sugestão 1: Seção "A Cleo se adapta ao seu negócio"

Adicionar uma seção com exemplos por profissão, mostrando como a Cleo resolve problemas específicos de cada um.

### Exemplos de cards por profissão:

| Profissão | Dor específica | Como a Cleo ajuda |
|-----------|---------------|-------------------|
| **Professor** | Precisa mandar material pra alunos específicos e esquece quem já recebeu | "Manda o PDF da aula 3 pro João e pra Maria" — Cleo envia e registra |
| **Corretor** | Tem 30 clientes interessados e não lembra quem viu qual imóvel | "Quem tá esperando retorno?" — Cleo lista por ordem de urgência |
| **Clínica/Consultório** | Pacientes faltam porque esquecem da consulta | Cleo lembra automaticamente: "Você tem 3 pacientes sem retorno há 5 dias" |
| **Consultor** | Perde follow-up de propostas enviadas | "Agenda retorno com a empresa X pra sexta" — Cleo lembra na hora certa |
| **Personal trainer** | Alunos somem e ele não percebe | Cleo avisa: "O Lucas não responde há 7 dias. Quer que eu te lembre amanhã?" |

### Formato sugerido:
- Tabs ou carousel com ícone da profissão
- Cada tab mostra: cenário real + comando de voz/texto + resposta da Cleo
- Visual tipo "conversa no WhatsApp" (mockup de chat)

---

## Sugestão 2: Ajustar o Hero

O hero atual diz "Nunca mais perca um cliente" — é bom, mas genérico.

### Opção A: Subtítulo com profissões
```
Conheça a Cleo! Sua secretária virtual no WhatsApp.
Para professores, corretores, consultores e quem vive de atendimento.
```

### Opção B: Rotação de frases por profissão (animação)
```
A Cleo organiza seus [alunos / clientes / pacientes / leads]
```
(texto rotaciona a cada 3 segundos)

---

## Sugestão 3: Ajustar Pain Points por contexto

Os pain points atuais são genéricos ("esquece de responder", "perde venda"). Poderiam ter exemplos concretos:

| Atual | Sugestão |
|-------|----------|
| "O cliente mandou mensagem e você só viu 3 dias depois" | "O aluno pediu o material da aula e você só viu 3 dias depois. Ele já desistiu do curso." |
| "Tem gente esperando retorno agora e você nem lembra quem é" | "Tem 5 pacientes esperando confirmação de horário e você nem lembra quem são." |

Ou manter genérico mas adicionar uma frase: "Seja professor, corretor ou consultor — o problema é o mesmo."

---

## Sugestão 4: FAQ — Adicionar pergunta sobre adaptação

Adicionar ao FAQ:
```
"A Cleo funciona pro meu tipo de negócio?"
"Sim! A Cleo se adapta a qualquer profissional que atende pelo WhatsApp: 
professores, corretores, consultores, personal trainers, clínicas, 
prestadores de serviço. Ela organiza seus contatos e faz acompanhamento 
independente do seu segmento."
```

---

## Sugestão 5: Seção de "Envio de Materiais"

Destacar que a Cleo pode enviar arquivos/materiais para contatos específicos. Isso é um diferencial forte para professores e consultores.

Exemplo de bullet no Benefits:
```
📎 Envio de materiais
"Manda o PDF pro João" — e a Cleo envia. Sem precisar procurar o contato.
```

---

## Sugestão 6: Social Proof por segmento (futuro)

Quando tiver depoimentos, organizar por profissão:
- "Sou professor e a Cleo me ajuda a..." 
- "Sou corretora e nunca mais perdi..."

---

## Prioridade de implementação

1. **Seção "A Cleo se adapta"** — maior impacto, mostra versatilidade
2. **Hero com profissões** — identifica o visitante imediatamente
3. **FAQ adicional** — responde objeção comum
4. **Pain points contextualizados** — opcional, refinamento
5. **Social proof** — quando tiver clientes reais

---

## Nota técnica

Todas as sugestões podem ser implementadas como componentes separados seguindo o padrão existente em `frontend/components/landing/`. Nenhuma requer mudança no backend.
