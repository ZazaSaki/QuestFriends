import JSZip from 'jszip';
import type { Node } from '@xyflow/react';
import { qrPngBlob, slug } from './qrExport';

interface Block { id: string; type: string; content: string }

export interface QrPackResult {
  blob: Blob;
  filename: string;
  qrCount: number;
  imageCount: number;
  /** Images whose source could not be fetched — reported to the user, not fatal. */
  failed: { file: string; url: string; reason: string }[];
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

/** Extension from the fetched blob's MIME type, else the URL path, else png. */
function extFor(url: string, type: string): string {
  const byMime = MIME_EXT[type.split(';')[0].trim().toLowerCase()];
  if (byMime) return byMime;
  try {
    const path = new URL(url, window.location.origin).pathname;
    const m = /\.([a-z0-9]{2,5})$/i.exec(path);
    if (m) return m[1].toLowerCase();
  } catch {
    /* blob: / data: / malformed — fall through */
  }
  return 'png';
}

/**
 * Split the graph the same way `graphToPayload` does, so the questN numbers in
 * the exported filenames line up with what gets saved to the backend.
 */
function splitNodes(nodes: Node[]): { intro?: Node; quests: Node[]; conclusion?: Node } {
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const roleOf = (n: Node) => (n.data as any).role as string | undefined;
  const intro = sorted.find((n) => roleOf(n) === 'intro') ?? sorted[0];
  const conclusion = sorted.find((n) => roleOf(n) === 'conclusion') ?? sorted[sorted.length - 1];
  return {
    intro,
    conclusion: conclusion === intro ? undefined : conclusion,
    quests: sorted.filter((n) => n !== intro && n !== conclusion && (roleOf(n) ?? 'quest') === 'quest'),
  };
}

/**
 * Build a zip of every QR code and every image in the game — the intro and
 * conclusion sections included, not just the quests.
 *
 *   qrcodes/quest1_<name>_qrCode1.png
 *   images/intro_<name>_img1.png
 *   images/quest1_<name>_img1.jpg
 *   images/conclusion_<name>_img1.png
 *   manifest.txt
 *
 * An image that cannot be fetched (CORS, dead URL, MinIO down) is recorded in
 * `failed` and in the manifest rather than aborting the whole export.
 */
export async function buildQrPack(gameName: string, nodes: Node[]): Promise<QrPackResult> {
  const zip = new JSZip();
  const { intro, quests, conclusion } = splitNodes(nodes);

  const lines: string[] = [
    `QR pack for: ${gameName || 'Untitled Game'}`,
    `Exported:    ${new Date().toISOString()}`,
    `Quests:      ${quests.length}`,
    '',
  ];
  const failed: QrPackResult['failed'] = [];
  let qrCount = 0;
  let imageCount = 0;

  /** Fetch a node's images into images/<prefix>_img<n>.<ext>, in editor order. */
  const addImages = async (d: any, prefix: string) => {
    const blocks: Block[] = [
      ...(Array.isArray(d.descriptionBlocks) ? d.descriptionBlocks : []),
      ...(Array.isArray(d.rewardBlocks) ? d.rewardBlocks : []),
    ];
    const images = blocks.filter((b) => b?.type === 'Image' && b.content);

    for (let j = 0; j < images.length; j++) {
      const url = images[j].content;
      const name = `${prefix}_img${j + 1}`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const file = `images/${name}.${extFor(url, blob.type)}`;
        zip.file(file, await blob.arrayBuffer());
        imageCount++;
        lines.push(`  ${file}  <- ${url}`);
      } catch (e) {
        const reason = (e as Error).message || 'fetch failed';
        failed.push({ file: name, url, reason });
        lines.push(`  !! FAILED ${name}  <- ${url}  (${reason})`);
      }
    }
    if (!images.length) lines.push('  (no images)');
  };

  // Intro — content only, no challenge.
  if (intro) {
    const d = intro.data as any;
    const title = String(d.label ?? 'Introduction');
    lines.push(`--- intro: ${title} ---`);
    await addImages(d, `intro_${slug(title)}`);
    lines.push('');
  }

  for (let i = 0; i < quests.length; i++) {
    const d = quests[i].data as any;
    const title = String(d.label ?? 'Untitled Quest');
    const prefix = `quest${i + 1}_${slug(title)}`;

    lines.push(`--- quest${i + 1}: ${title} ---`);

    // QR code — the payload must stay the raw challenge code: the backend
    // compares it verbatim against the quest's openChallengeValue.
    if (d.challengeMode === 'QR' && d.challengeCode) {
      const file = `qrcodes/${prefix}_qrCode1.png`;
      // ArrayBuffer rather than Blob: JSZip only accepts Blob in a browser.
      zip.file(file, await (await qrPngBlob(String(d.challengeCode))).arrayBuffer());
      qrCount++;
      lines.push(`  ${file}  <- code: ${d.challengeCode}`);
    } else {
      lines.push(`  (no QR — challenge mode is ${d.challengeMode ?? 'None'})`);
    }

    await addImages(d, prefix);
    lines.push('');
  }

  // Conclusion — content only, no challenge.
  if (conclusion) {
    const d = conclusion.data as any;
    const title = String(d.label ?? 'Conclusion');
    lines.push(`--- conclusion: ${title} ---`);
    await addImages(d, `conclusion_${slug(title)}`);
    lines.push('');
  }

  if (failed.length) {
    lines.push('=== FAILED DOWNLOADS ===');
    for (const f of failed) lines.push(`${f.file}  <- ${f.url}  (${f.reason})`);
    lines.push('');
  }

  lines.push(`Totals: ${qrCount} QR code(s), ${imageCount} image(s), ${failed.length} failed.`);
  zip.file('manifest.txt', lines.join('\n'));

  return {
    blob: await zip.generateAsync({ type: 'blob' }),
    filename: `${slug(gameName || 'game')}_qr_pack.zip`,
    qrCount,
    imageCount,
    failed,
  };
}
