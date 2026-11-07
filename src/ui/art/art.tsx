/**
 * Illustration entry point. Screens import from here; the isometric SVG art lives in
 * iso.tsx (primitives), buildings.tsx, City.tsx and Scenes.tsx. All text comes from state.
 */
import type { IndustryId } from '../../engine/types';
import { IND_COLOR } from './Scenes';

export const industryColor = (i: IndustryId) => IND_COLOR[i];
export { CityScene } from './City';
export { BearBadge, BullBadge, Cutaway, IndustryThumb, Portrait, TradingFloor, WorldMap } from './Scenes';
