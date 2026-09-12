/**
 * Relatórios — tabela de resultados, detalhe de uma persona e relatório final.
 */

import { config } from './config.js';
import type { FunctionalScores } from './judge.js';
import { isTechnicalScenario } from './scenarios/technical.js';
import type { ConversationResult } from './types.js';

export function formatTable(results: ConversationResult[]): string {
  // Verifica se algum resultado tem corretude_funcional
  const hasFunctional = results.some(r => 'corretude_funcional' in r.verdict.scores);

  if (hasFunctional) {
    const header = '│ Persona                          │ Cenário            │ Relev │ Tom  │ Fact │ Comp │ Nat  │ Func │ Média │ OK? │';
    const sep =    '├──────────────────────────────────┼────────────────────┼───────┼──────┼──────┼──────┼──────┼──────┼───────┼─────┤';
    const topSep = '┌──────────────────────────────────┬────────────────────┬───────┬──────┬──────┬──────┬──────┬──────┬───────┬─────┐';
    const botSep = '└──────────────────────────────────┴────────────────────┴───────┴──────┴──────┴──────┴──────┴──────┴───────┴─────┘';

    const rows = results.map(r => {
      const name = r.persona.name.slice(0, 32).padEnd(32);
      const scenario = r.persona.scenario.slice(0, 18).padEnd(18);
      const s = r.verdict.scores;
      const func = 'corretude_funcional' in s ? (s as FunctionalScores).corretude_funcional.toFixed(2) : ' —  ';
      const ok = r.verdict.pass ? '✅' : '❌';
      return `│ ${name} │ ${scenario} │ ${s.relevancia.toFixed(2)} │ ${s.tom_de_voz.toFixed(2)} │ ${s.factualidade.toFixed(2)} │ ${s.completude.toFixed(2)} │ ${s.naturalidade.toFixed(2)} │ ${func} │ ${r.verdict.media.toFixed(2)}  │ ${ok}  │`;
    });

    return [topSep, header, sep, ...rows, botSep].join('\n');
  }

  // Tabela original sem coluna funcional
  const header = '│ Persona                          │ Cenário            │ Relev │ Tom  │ Fact │ Comp │ Nat  │ Média │ OK? │';
  const sep =    '├──────────────────────────────────┼────────────────────┼───────┼──────┼──────┼──────┼──────┼───────┼─────┤';
  const topSep = '┌──────────────────────────────────┬────────────────────┬───────┬──────┬──────┬──────┬──────┬───────┬─────┐';
  const botSep = '└──────────────────────────────────┴────────────────────┴───────┴──────┴──────┴──────┴──────┴───────┴─────┘';

  const rows = results.map(r => {
    const name = r.persona.name.slice(0, 32).padEnd(32);
    const scenario = r.persona.scenario.slice(0, 18).padEnd(18);
    const s = r.verdict.scores;
    const ok = r.verdict.pass ? '✅' : '❌';
    return `│ ${name} │ ${scenario} │ ${s.relevancia.toFixed(2)} │ ${s.tom_de_voz.toFixed(2)} │ ${s.factualidade.toFixed(2)} │ ${s.completude.toFixed(2)} │ ${s.naturalidade.toFixed(2)} │ ${r.verdict.media.toFixed(2)}  │ ${ok}  │`;
  });

  return [topSep, header, sep, ...rows, botSep].join('\n');
}

export function formatSingleResult(result: ConversationResult): string {
  const { turns, verdict } = result;
  const lines: string[] = [];

  lines.push(`   💬 ${turns.length} turnos`);
  lines.push(`   📊 Média: ${verdict.media.toFixed(2)} ${verdict.pass ? '✅ PASSOU' : '❌ FALHOU'}`);

  const s = verdict.scores;
  lines.push(`   📈 Scores: relevância=${s.relevancia.toFixed(2)} tom=${s.tom_de_voz.toFixed(2)} factual=${s.factualidade.toFixed(2)} completude=${s.completude.toFixed(2)} naturalidade=${s.naturalidade.toFixed(2)}`);

  if (verdict.problemas.length > 0) {
    lines.push('');
    lines.push('   ⚠️  Problemas:');
    verdict.problemas.forEach(p => lines.push(`      • ${p}`));
  }

  if (!verdict.pass && verdict.razao) {
    lines.push(`   📝 Razão: ${verdict.razao}`);
  }

  if (!verdict.pass && turns.length > 0) {
    lines.push('');
    lines.push('   📜 Transcript:');
    turns.forEach(t => {
      const prefix = t.role === 'user' ? '👤' : '🤖';
      lines.push(`   ${prefix} ${t.content.slice(0, 120)}${t.content.length > 120 ? '...' : ''}`);
    });
  }

  return lines.join('\n');
}



/**
 * Imprime o relatório final completo (tabela, resumos por tipo, problemas
 * e personas que falharam). Retorna true se tudo passou.
 */
export function printFinalReport(results: ConversationResult[], aborted: boolean, totalPersonas: number): boolean {
  console.log('');
  console.log('═'.repeat(100));
  console.log('                                    RELATÓRIO FINAL');
  if (aborted) {
    console.log(`                            (parcial — ${results.length}/${totalPersonas} personas executadas)`);
  }
  console.log('═'.repeat(100));
  console.log('');

  if (results.length === 0) {
    console.log('   Nenhuma persona foi executada.');
    return false;
  }

  console.log(formatTable(results));
  console.log('');

  const passed = results.filter(r => r.verdict.pass).length;
  const total = results.length;
  const avgScore = results.reduce((sum, r) => sum + r.verdict.media, 0) / total;

  console.log(`📊 Resultado: ${passed}/${total} conversas passaram (threshold: ${config.passThreshold})`);
  console.log(`📊 Score médio: ${avgScore.toFixed(2)}`);

  // Separar resultados por tipo
  const conversationalResults = results.filter(r => !isTechnicalScenario(r.persona.scenario));
  const technicalResults = results.filter(r => isTechnicalScenario(r.persona.scenario));

  if (technicalResults.length > 0) {
    const techPassed = technicalResults.filter(r => r.verdict.pass).length;
    console.log(`📊 Técnicos: ${techPassed}/${technicalResults.length} passaram`);
  }

  if (conversationalResults.length > 0) {
    const convPassed = conversationalResults.filter(r => r.verdict.pass).length;
    const convAvg = conversationalResults.reduce((sum, r) => sum + r.verdict.media, 0) / conversationalResults.length;
    console.log(`📊 Conversacionais: ${convPassed}/${conversationalResults.length} passaram (média: ${convAvg.toFixed(2)})`);
  }

  // Problemas encontrados
  const allProblems = results.flatMap(r => r.verdict.problemas);
  if (allProblems.length > 0) {
    console.log('');
    console.log('⚠️  Problemas encontrados:');
    [...new Set(allProblems)].forEach(p => console.log(`   • ${p}`));
  }

  // Conversas que falharam (resumo)
  const failed = results.filter(r => !r.verdict.pass);
  if (failed.length > 0) {
    console.log('');
    console.log('❌ Personas que falharam:');
    for (const f of failed) {
      console.log(`   • [${f.persona.name}] (${f.persona.scenario}) — ${f.verdict.razao}`);
    }
  }

  console.log('');
  console.log('═'.repeat(100));

  return passed === total;
}

