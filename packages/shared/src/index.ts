export type Element =
  | 'Physical'
  | 'Fire'
  | 'Ice'
  | 'Thunder'
  | 'Wind'
  | 'Quantum'
  | 'Imaginary';

export type DamageKind =
  | 'direct'
  | 'dot'
  | 'breakTrigger'
  | 'breakDot'
  | 'superBreak'
  | 'elation'
  | 'trueDamage';

export type BreakDotType =
  | 'burn'
  | 'windShear'
  | 'shock'
  | 'bleed'
  | 'entanglement'
  | 'freeze';

export const SHARED_PACKAGE = '@hsr-calc/shared';
