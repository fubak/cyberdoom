import { Registry } from '../../core/registry';
import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import { m01, m01Teach } from './m01-patch-tuesday';
import { m02, m02Teach } from './m02-need-to-know';
import { m03, m03Teach } from './m03-quiet-one';
import { m06, m06Teach } from './m06-keymaster';
import { m08, m08Teach } from './m08-zero-day';
import { m09, m09Teach } from './m09-locked-out';

/** CURRICULUM: all missions, keyed by id (arc order). */
export const missionRegistry = new Registry<Mission>();

for (const m of [m01, m02, m03, m06, m08, m09]) missionRegistry.register(m.id, m);

/** CURRICULUM: briefing dossier + after-action lessons, keyed by mission id. */
export const teachingRegistry = new Registry<MissionTeaching>();
teachingRegistry.register('m01', m01Teach);
teachingRegistry.register('m02', m02Teach);
teachingRegistry.register('m03', m03Teach);
teachingRegistry.register('m06', m06Teach);
teachingRegistry.register('m08', m08Teach);
teachingRegistry.register('m09', m09Teach);
