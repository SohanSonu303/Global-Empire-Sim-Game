/**
 * Industry licences. You may only found companies in industries you hold a licence for. Your
 * first industry is free (granted with your first company); further licences are bought from the
 * government and get dearer the more you hold. Buying a company brings its licence with it.
 */
import { GOODS, INDUSTRIES, LICENCE_FEE } from './data';
import { licenceDiscount } from './rewards';
import { addNews, fmtMoney } from './news';
import type { CommandResult, IndustryId, WorldState } from './types';

export function licences(w: WorldState): IndustryId[] {
  return w.player.licences ?? [];
}

export function hasLicence(w: WorldState, ind: IndustryId): boolean {
  return licences(w).includes(ind);
}

/** What the next licence for this industry costs (0 if you hold it, or if it would be your first). */
export function licenceFee(w: WorldState, ind: IndustryId): number {
  if (hasLicence(w, ind)) return 0;
  const held = licences(w).length;
  if (held === 0) return 0;
  return LICENCE_FEE[ind] * (1 + 0.5 * (held - 1)) * (1 - licenceDiscount(w));
}

export function grantLicence(w: WorldState, ind: IndustryId): void {
  if (!hasLicence(w, ind)) w.player.licences = [...licences(w), ind];
}

/** Licences for every industry you already run a company in (old saves, buyouts, the starting company). */
export function ensureLicences(w: WorldState): void {
  for (const c of w.companies) if (c.isPlayer && !c.bankrupt) grantLicence(w, GOODS[c.good].industry);
}

export function buyLicence(w: WorldState, ind: IndustryId): CommandResult {
  if (!INDUSTRIES[ind]) return { ok: false, message: 'Unknown industry' };
  if (hasLicence(w, ind)) return { ok: false, message: 'You already hold this licence' };
  const fee = licenceFee(w, ind);
  if (fee === 0) return { ok: false, message: 'Your first industry is free: just found a company in it' };
  if (w.player.cash < fee) return { ok: false, message: `The ${INDUSTRIES[ind].name} licence costs ${fmtMoney(fee)}` };
  w.player.cash -= fee;
  w.macro.govDebt = Math.max(0, w.macro.govDebt - fee);
  grantLicence(w, ind);
  addNews(w, 'player', `You win a ${INDUSTRIES[ind].name.toLowerCase()} licence`, `The government grants you the right to open ${INDUSTRIES[ind].name.toLowerCase()} companies for ${fmtMoney(fee)}.`, 'good');
  return { ok: true, message: `${INDUSTRIES[ind].name} licence bought for ${fmtMoney(fee)}` };
}
