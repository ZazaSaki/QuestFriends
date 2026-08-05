import type { Node, Edge } from '@xyflow/react';
import type { GameDetail, QuestDetail, NewQuest } from './api';

type BlockType = 'Text' | 'Image' | 'Video' | 'Audio';
interface Block { id: string; type: BlockType; content: string }
type Role = 'intro' | 'quest' | 'conclusion';

const rid = () => Math.random().toString(36).slice(2, 9);

const CHALLENGE_MODE: Record<string, string> = { NONE: 'None', QR: 'QR', PASSWORD: 'Code' };
const CONFIRM_MODE: Record<string, string> = { QUIZ: 'Quiz', PHOTO: 'Image Upload', VIDEO: 'Video Upload' };
const OPEN_TYPE: Record<string, 'NONE' | 'QR' | 'PASSWORD'> = { None: 'NONE', QR: 'QR', Code: 'PASSWORD' };
const CHALLENGE_TYPE: Record<string, 'QUIZ' | 'PHOTO' | 'VIDEO'> = { Quiz: 'QUIZ', 'Image Upload': 'PHOTO', 'Video Upload': 'VIDEO' };

function normType(t: unknown): BlockType {
  const s = String(t || '').toLowerCase();
  if (s.startsWith('img') || s === 'image') return 'Image';
  if (s === 'video') return 'Video';
  if (s === 'audio') return 'Audio';
  return 'Text';
}

/** Best-effort: free-form content JSON → builder content blocks. */
export function contentToBlocks(content: unknown): Block[] {
  const c = (content && typeof content === 'object' ? content : {}) as Record<string, any>;
  if (Array.isArray(c.blocks)) {
    return c.blocks.map((b: any) => ({ id: rid(), type: normType(b.type), content: String(b.content ?? b.url ?? '') }));
  }
  const blocks: Block[] = [];
  const text = c.text ?? c.description;
  if (text) blocks.push({ id: rid(), type: 'Text', content: String(text) });
  const push = (val: any, type: BlockType) => { if (val) blocks.push({ id: rid(), type, content: String(val) }); };
  push(c.image, 'Image');
  push(c.video, 'Video');
  push(c.audio, 'Audio');
  if (c.mediaUrl && c.mediaType) push(c.mediaUrl, normType(c.mediaType));
  return blocks;
}

/** Canonical serialization for content / reward / intro / conclusion. */
export function blocksToContent(blocks: Block[] | undefined) {
  return { blocks: (blocks ?? []).map((b) => ({ type: b.type, content: b.content })) };
}

const withDefaultText = (blocks: Block[]): Block[] =>
  blocks.length ? blocks : [{ id: rid(), type: 'Text', content: '' }];

function questToData(q: QuestDetail, game: GameDetail) {
  return {
    role: 'quest' as Role,
    label: q.title,
    points: q.score,
    challengeMode: CHALLENGE_MODE[q.openChallengeType] ?? 'None',
    challengeCode: q.openChallengeValue ?? '',
    confirmationMode: CONFIRM_MODE[q.challengeType] ?? 'Quiz',
    descriptionBlocks: withDefaultText(contentToBlocks(q.content)),
    rewardBlocks: contentToBlocks(q.postChallengeContent),
    quizQuestions: [{ id: rid(), question: '', options: ['', ''], correctOptionIndex: 0 }],
    nodeTracks: game.tracks.map((t) => {
      const wp = t.waypoints.find((w) => w.questId === q.id);
      return { id: rid(), name: t.name, coordinate: wp ? `${wp.latitude}, ${wp.longitude}` : '' };
    }),
  };
}

const contentNodeData = (role: Role, label: string, content: unknown) => ({
  role,
  label,
  descriptionBlocks: withDefaultText(contentToBlocks(content)),
});

/** Loaded game → React-Flow graph: Introduction → quests… → Conclusion. */
export function gameToGraph(game: GameDetail): { nodes: Node[]; edges: Edge[] } {
  const richest = [...game.tracks].sort((a, b) => b.waypoints.length - a.waypoints.length)[0];
  const order = new Map<string, number>();
  richest?.waypoints.forEach((w) => { if (!order.has(w.questId)) order.set(w.questId, w.sequenceOrder); });
  const quests = [...game.quests].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let y = 50;

  nodes.push({ id: 'intro', type: 'quest', position: { x: 250, y }, data: contentNodeData('intro', 'Introduction', game.introduction) });
  y += 130;

  const questIds: string[] = [];
  quests.forEach((q) => {
    nodes.push({ id: q.id, type: 'quest', position: { x: 250, y }, data: questToData(q, game) });
    questIds.push(q.id);
    y += 130;
  });

  nodes.push({ id: 'conclusion', type: 'quest', position: { x: 250, y }, data: contentNodeData('conclusion', 'Conclusion', game.conclusion) });

  const chain = ['intro', ...questIds, 'conclusion'];
  for (let i = 0; i < chain.length - 1; i++) {
    edges.push({ id: `e-${chain[i]}-${chain[i + 1]}`, source: chain[i], target: chain[i + 1], animated: true });
  }
  return { nodes, edges };
}

// ---------- Save: graph → backend payload ----------

function parseCoord(s: string | undefined): [number, number] | null {
  if (!s) return null;
  const m = s.split(',').map((x) => parseFloat(x.trim()));
  if (m.length === 2 && Number.isFinite(m[0]) && Number.isFinite(m[1])) return [m[0], m[1]];
  return null;
}

export interface TrackPayload {
  name: string;
  waypoints: { questIndex: number; sequenceOrder: number; latitude: number; longitude: number }[];
}
export interface SavePayload {
  introduction: unknown;
  conclusion: unknown;
  quests: Omit<NewQuest, 'gameId'>[];
  tracks: TrackPayload[];
}

export function graphToPayload(totalTracks: number, nodes: Node[]): SavePayload {
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const roleOf = (n: Node) => (n.data as any).role as Role | undefined;

  const intro = sorted.find((n) => roleOf(n) === 'intro') ?? sorted[0];
  const conclusion = sorted.find((n) => roleOf(n) === 'conclusion') ?? sorted[sorted.length - 1];
  const questNodes = sorted.filter((n) => n !== intro && n !== conclusion && (roleOf(n) ?? 'quest') === 'quest');

  const quests = questNodes.map((n) => {
    const d = n.data as any;
    const challengeType = CHALLENGE_TYPE[d.confirmationMode] ?? 'QUIZ';
    const content: Record<string, unknown> = blocksToContent(d.descriptionBlocks);
    if (challengeType === 'QUIZ' && Array.isArray(d.quizQuestions) && d.quizQuestions.length) {
      const q0 = d.quizQuestions[0];
      content.quiz = d.quizQuestions;
      content.answer = q0?.options?.[q0?.correctOptionIndex] ?? '';
    }
    return {
      title: d.label ?? 'Untitled Quest',
      score: typeof d.points === 'number' ? d.points : 10,
      openChallengeType: OPEN_TYPE[d.challengeMode] ?? 'NONE',
      openChallengeValue: d.challengeCode || null,
      challengeType,
      content,
      postChallengeContent: blocksToContent(d.rewardBlocks),
    } as Omit<NewQuest, 'gameId'>;
  });

  const tracks: TrackPayload[] = [];
  for (let t = 0; t < totalTracks; t++) {
    const waypoints: TrackPayload['waypoints'] = [];
    questNodes.forEach((n, qi) => {
      const coord = parseCoord((n.data as any).nodeTracks?.[t]?.coordinate);
      if (coord) waypoints.push({ questIndex: qi, sequenceOrder: qi + 1, latitude: coord[0], longitude: coord[1] });
    });
    tracks.push({ name: `Track ${t + 1}`, waypoints });
  }

  return {
    introduction: blocksToContent((intro?.data as any)?.descriptionBlocks),
    conclusion: blocksToContent((conclusion?.data as any)?.descriptionBlocks),
    quests,
    tracks,
  };
}

// ---------- Download / Upload ----------

export interface BuilderState { gameName: string; totalTracks: number; nodes: Node[]; edges: Edge[] }

export function builderToJSON(state: BuilderState): string {
  return JSON.stringify({ version: 1, ...state }, null, 2);
}

export function jsonToBuilder(text: string): BuilderState {
  const o = JSON.parse(text);
  if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) throw new Error('Invalid builder file: missing nodes/edges');
  return {
    gameName: typeof o.gameName === 'string' ? o.gameName : 'Imported Game',
    totalTracks: Math.max(1, parseInt(o.totalTracks, 10) || 1),
    nodes: o.nodes,
    edges: o.edges,
  };
}
