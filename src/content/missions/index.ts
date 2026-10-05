import { Registry } from '../../core/registry';
import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import { m01, m01Teach } from './m01-patch-tuesday';
import { m02, m02Teach } from './m02-need-to-know';
import { m03, m03Teach } from './m03-quiet-one';
import { m04, m04Teach } from './m04-hook-line-sinker';
import { m05, m05Teach } from './m05-change-freeze';
import { m09, m09Teach } from './m09-locked-out';

/** CURRICULUM: all missions, keyed by id (arc order). */
export const missionRegistry = new Registry<Mission>();

for (const m of [m01, m02, m03, m04, m05, m09]) missionRegistry.register(m.id, m);

/** CURRICULUM: briefing dossier + after-action lessons, keyed by mission id. */
export const teachingRegistry = new Registry<MissionTeaching>();
teachingRegistry.register('m01', m01Teach);
teachingRegistry.register('m02', m02Teach);
teachingRegistry.register('m03', m03Teach);
teachingRegistry.register('m04', m04Teach);
teachingRegistry.register('m05', m05Teach);
teachingRegistry.register('m09', m09Teach);
