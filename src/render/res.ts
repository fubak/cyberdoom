export const RES = 4;
export const BASE_W = 320, BASE_H = 200, BASE_STATUS = 32;
export const VIEW_W = BASE_W * RES, VIEW_H = BASE_H * RES, STATUS_H = BASE_STATUS * RES, VIEW3D_H = VIEW_H - STATUS_H;
export const TEX = { wallW: 64 * RES, wallH: 80 * RES, flat: 64 * RES, monster: 64 * RES } as const;
