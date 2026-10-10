/**
 * Threat sprite registration. Logicbomb and rat used to be lazy recolors of
 * the worm/trojan sprite sets; both now have their own rasterised models in
 * src/render/sprites.ts (registered by buildSprites), so this hook is kept
 * only so mission bootstrap call sites keep working.
 */
export function registerThreatSprites(): void {
  // no-op: all threat sprite sets are real models now
}
