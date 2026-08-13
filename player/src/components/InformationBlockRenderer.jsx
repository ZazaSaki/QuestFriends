import Icon from './Icon';

/**
 * Quest / intro / reward content is authored in the manager as
 *   { blocks: [{ type: 'Text' | 'Image' | 'Video' | 'Audio', content: string }] }
 * (see managerFrontend/src/lib/questMapping.ts). Older records use a flat shape
 * ({ description }, { text }, { image }, { mediaUrl, mediaType }), so normalise
 * both into one array — mirroring `contentToBlocks` on the manager side.
 */
export function toBlocks(content) {
  const c = content && typeof content === 'object' ? content : {};

  const normType = (t) => {
    const s = String(t || '').toLowerCase();
    if (s.startsWith('img') || s === 'image') return 'Image';
    if (s === 'video') return 'Video';
    if (s === 'audio') return 'Audio';
    return 'Text';
  };

  if (Array.isArray(c.blocks)) {
    return c.blocks
      .map((b) => ({ type: normType(b.type), content: String(b.content ?? b.url ?? '') }))
      .filter((b) => b.content.trim() !== '');
  }

  const blocks = [];
  const text = c.text ?? c.description ?? c.reward;
  if (text) blocks.push({ type: 'Text', content: String(text) });
  const push = (val, type) => {
    if (val) blocks.push({ type, content: String(val) });
  };
  push(c.image, 'Image');
  push(c.video, 'Video');
  push(c.audio, 'Audio');
  if (c.mediaUrl && c.mediaType) push(c.mediaUrl, normType(c.mediaType));

  // A plain string body (some seeds store `content: "…"`).
  if (!blocks.length && typeof content === 'string' && content.trim()) {
    blocks.push({ type: 'Text', content });
  }
  return blocks;
}

function TextBlock({ value }) {
  // Authors write paragraphs separated by blank lines; keep that rhythm.
  return value
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((paragraph, i) => (
      <p key={i} className="font-body-lg text-body-lg leading-relaxed whitespace-pre-line">
        {paragraph}
      </p>
    ));
}

function ImageBlock({ value }) {
  return (
    <figure className="rounded-[16px] overflow-hidden shadow-ambient-md border border-outline-variant/30 dark:border-white/10">
      <img
        src={value}
        alt=""
        loading="lazy"
        className="w-full max-h-72 object-cover object-center"
      />
    </figure>
  );
}

/**
 * Native <audio controls> dressed in the Stitch audio card (surface tile, round
 * accent icon, animated wave bars) — real transport controls instead of the
 * static play button and fake progress bar in the mock.
 */
function AudioBlock({ value }) {
  return (
    <div className="bg-surface dark:bg-white/5 p-4 rounded-[16px] border border-outline-variant/50 dark:border-white/10 flex flex-col gap-stack-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-on-secondary shadow-sm shrink-0">
            <Icon name="graphic_eq" fill />
          </span>
          <span className="font-label-sm text-label-sm text-on-surface dark:text-inverse-on-surface uppercase">
            Guia em Áudio
          </span>
        </div>
        <div className="audio-wave" aria-hidden="true">
          <span className="wave-bar" />
          <span className="wave-bar" />
          <span className="wave-bar" />
          <span className="wave-bar" />
          <span className="wave-bar" />
        </div>
      </div>
      <audio controls preload="metadata" src={value} className="w-full">
        <a href={value}>Download the audio</a>
      </audio>
    </div>
  );
}

function VideoBlock({ value }) {
  return (
    <div className="rounded-[16px] overflow-hidden shadow-ambient-md border border-outline-variant/30 dark:border-white/10 bg-black">
      <video
        controls
        playsInline
        preload="metadata"
        src={value}
        className="w-full max-h-80 bg-black"
      />
    </div>
  );
}

/**
 * Renders an array of authored information blocks.
 *
 * `dropLeadingImage` (default true) removes the very first image at the top of a
 * content block — mission descriptions open on their text, not on a hero image.
 * Images further down the block list still render.
 */
export default function InformationBlockRenderer({
  content,
  blocks: blocksProp,
  dropLeadingImage = true,
  className = 'space-y-stack-md',
}) {
  let blocks = blocksProp ?? toBlocks(content);

  if (dropLeadingImage && blocks.length && blocks[0].type === 'Image') {
    blocks = blocks.slice(1);
  }

  if (!blocks.length) return null;

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'Image':
            return <ImageBlock key={i} value={block.content} />;
          case 'Audio':
            return <AudioBlock key={i} value={block.content} />;
          case 'Video':
            return <VideoBlock key={i} value={block.content} />;
          default:
            return <TextBlock key={i} value={block.content} />;
        }
      })}
    </div>
  );
}
