import { Registry } from '../../core/registry';
import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import { m01, m01Teach } from './m01-patch-tuesday';
import { m02, m02Teach } from './m02-need-to-know';
import { m03, m03Teach } from './m03-quiet-one';
import { m04, m04Teach } from './m04-hook-line-sinker';
import { m05, m05Teach } from './m05-change-freeze';
import { m06, m06Teach } from './m06-keymaster';
import { m07, m07Teach } from './m07-segment-fault';
import { m08, m08Teach } from './m08-zero-day';
import { m09, m09Teach } from './m09-locked-out';
import { m10, m10Teach } from './m10-third-party';
import { m11, m11Teach } from './m11-audit-night';
import { m12, m12Teach } from './m12-robo-soc';
import { m13, m13Teach } from './m13-honeypot';

/** CURRICULUM: all missions, keyed by id (arc order). */
export const missionRegistry = new Registry<Mission>();

for (const m of [m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12]) missionRegistry.register(m.id, m);

/** CURRICULUM: briefing dossier + after-action lessons, keyed by mission id. */
export const teachingRegistry = new Registry<MissionTeaching>();
teachingRegistry.register('m01', m01Teach);
teachingRegistry.register('m02', m02Teach);
teachingRegistry.register('m03', m03Teach);
teachingRegistry.register('m04', m04Teach);
teachingRegistry.register('m05', m05Teach);
teachingRegistry.register('m06', m06Teach);
teachingRegistry.register('m07', m07Teach);
teachingRegistry.register('m08', m08Teach);
teachingRegistry.register('m09', m09Teach);
teachingRegistry.register('m10', m10Teach);
teachingRegistry.register('m11', m11Teach);
teachingRegistry.register('m12', m12Teach);
teachingRegistry.register('m13', m13Teach);

/** EGGS: hidden bonus missions, off the campaign arc. They are deliberately
 *  NOT registered in missionRegistry: the arc list, mission select, coverage
 *  weights, and walkthrough/pickup contracts all key off the registry. They
 *  are reachable through secret exits, deep links, and __cd.startMission. */
export const bonusMissions: Record<string, Mission> = { m13 };

export function missionById(id: string): Mission | undefined {
  return missionRegistry.get(id) ?? bonusMissions[id];
}

export function requireMission(id: string): Mission {
  const m = missionById(id);
  if (!m) throw new Error(`unknown mission ${id}`);
  return m;
}
