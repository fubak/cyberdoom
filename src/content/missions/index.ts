import { Registry } from '../../core/registry';
import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import { m01, m01Teach } from './m01-patch-tuesday';
import { m02, m02Teach } from './m02-need-to-know';
import { m03, m03Teach } from './m03-quiet-one';

/** CURRICULUM: all missions, keyed by id. */
export const missionRegistry = new Registry<Mission>();

for (const m of [m01, m02, m03]) missionRegistry.register(m.id, m);

/** CURRICULUM: briefing dossier + after-action lessons, keyed by mission id. */
export const teachingRegistry = new Registry<MissionTeaching>();
teachingRegistry.register('m01', m01Teach);
teachingRegistry.register('m02', m02Teach);
teachingRegistry.register('m03', m03Teach);
