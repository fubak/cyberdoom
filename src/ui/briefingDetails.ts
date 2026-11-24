import type { Mission } from '../core/types';
import { define } from '../content/glossary';
import { teachingRegistry } from '../content/missions';
import { objectiveById } from '../content/objectives';
import { block, heading, type PLine } from './debrief-layout';

export interface BriefingPalette {
  gold: string;
  text: string;
  orange: string;
  dim: string;
}

/**
 * CURRICULUM: the briefing DETAILS text as paginate() blocks. Section headings are
 * keep-with-next, so none is stranded at the foot of a page, and each glossary term
 * is its own block with its definition, so a term never sits on one page with its
 * definition on the next.
 */
export function briefingDetailBlocks(
  mission: Mission,
  c: BriefingPalette,
  domainColor: (domain: number) => string,
): PLine[][] {
  const teach = teachingRegistry.get(mission.id);
  const orders = teach?.orders ?? mission.missionObjectives.map((o) => ({ text: o.text, objective: '' }));
  const blocks: PLine[][] = [
    heading('SITUATION', c.gold),
    block(teach?.situation ?? mission.briefing, c.text, { font: 'chunky' }),
    heading('ALL ORDERS', c.gold),
    ...orders.map((order, i) => block(order.text, c.text, { prefix: String(i + 1), prefixColor: c.gold, font: 'chunky' })),
  ];
  const objRows = mission.objectives.flatMap((id) => {
    const objective = objectiveById(id);
    return objective ? block(`${id} ${objective.title}`, domainColor(objective.domain), { font: 'chunky' }) : [];
  });
  const terms = (teach?.keyTerms ?? []).flatMap((term) => {
    const definition = define(term);
    if (!definition) return [];
    return [[
      ...block(term, c.orange, { font: 'chunky' }),
      ...block(definition.replace(/\s*\[[\d., ]+\]\s*$/, ''), c.dim, { indent: 10 }),
    ]];
  });
  return [
    ...blocks,
    ...(objRows.length ? [heading('SY0-701 OBJECTIVES', c.gold), objRows] : []),
    ...(terms.length ? [heading('KEY TERMS', c.gold), ...terms] : []),
  ];
}
