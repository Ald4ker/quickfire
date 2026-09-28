import { BroadcastBoard, BroadcastHome, BroadcastLobby, BroadcastQuestion, BroadcastResults } from './broadcast';
import { EditorialBoard, EditorialHome, EditorialLobby, EditorialQuestion, EditorialResults } from './editorial';
import { TabletopBoard, TabletopHome, TabletopLobby, TabletopQuestion, TabletopResults } from './tabletop';
import type { Round2DirectionId } from './direction';
import type { R2BoardProps, R2HomeProps, R2LobbyProps, R2QuestionProps, R2ResultsProps } from './shared';

export { useRound2Direction, getRound2Direction, ROUND2_ENABLED, ROUND2_DIRECTION_IDS, ROUND2_LABELS, useRound2Store } from './direction';
export type { Round2DirectionId } from './direction';
export type { R2BoardColumn } from './shared';
export { getR2Colors } from './theme';

type D = { direction: Round2DirectionId };

export function R2Home({ direction, ...p }: D & R2HomeProps) {
  if (direction === 'editorial') return <EditorialHome {...p} />;
  if (direction === 'tabletop') return <TabletopHome {...p} />;
  return <BroadcastHome {...p} />;
}

export function R2Lobby({ direction, ...p }: D & R2LobbyProps) {
  if (direction === 'editorial') return <EditorialLobby {...p} />;
  if (direction === 'tabletop') return <TabletopLobby {...p} />;
  return <BroadcastLobby {...p} />;
}

export function R2Board({ direction, ...p }: D & R2BoardProps) {
  if (direction === 'editorial') return <EditorialBoard {...p} />;
  if (direction === 'tabletop') return <TabletopBoard {...p} />;
  return <BroadcastBoard {...p} />;
}

export function R2Question({ direction, ...p }: D & R2QuestionProps) {
  if (direction === 'editorial') return <EditorialQuestion {...p} />;
  if (direction === 'tabletop') return <TabletopQuestion {...p} />;
  return <BroadcastQuestion {...p} />;
}

export function R2Results({ direction, ...p }: D & R2ResultsProps) {
  if (direction === 'editorial') return <EditorialResults {...p} />;
  if (direction === 'tabletop') return <TabletopResults {...p} />;
  return <BroadcastResults {...p} />;
}
