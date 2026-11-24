/**
 * Display labels for badge-reader role ids. Role ids are lowercase keys
 * ('itops'); players should read words ('IT OPS'). Unknown roles fall back to
 * the upper-cased id, so new content still renders something sensible.
 */
const ROLE_LABELS: Readonly<Record<string, string>> = {
  itops: 'IT OPS',
  netops: 'NET OPS',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role.toLowerCase()] ?? role.toUpperCase();
}
