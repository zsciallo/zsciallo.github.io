import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { iconSrc } from '../../lib/storeContent';

// A perk that leads with a figure ("20 homes", "3% off") gets that figure set
// apart, so a list of limits can be scanned by its numbers.
function PerkText({ text }) {
  const figure = /^([+-]?\$?\d[\d,.]*(?:%|x)?)\s+(.*)$/.exec(text);
  if (!figure) return text;
  return <><strong class="store-perk-figure">{figure[1]}</strong>{figure[2]}</>;
}

// A missing sprite gets a tinted two-letter tile instead of a broken image, the
// same idea as the market's ItemIcon. Newer items (spears, some spawn eggs) have
// no vendored sprite yet, so this is a normal path, not an error state.
function hue(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export function StoreIcon({ icon, name, size = 32, glow = false }) {
  const [failed, setFailed] = useState(false);
  const src = iconSrc(icon);
  const style = `width:${size}px;height:${size}px`;

  if (failed || !src) {
    const h = hue(name || icon || '?');
    return (
      <span class="store-icon store-icon--glyph" aria-hidden="true"
        style={`${style};background:hsl(${h} 45% 22%);color:hsl(${h} 70% 78%)`}>
        {(name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img class={`store-icon${glow ? ' store-icon--glow' : ''}`} style={style} src={src} alt=""
      loading="lazy" width={size} height={size} onError={() => setFailed(true)} />
  );
}

const slug = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** The in-game item tooltip: name, enchantments, then lore. */
function ItemTooltip({ item, rarity }) {
  return (
    <div class="store-tooltip">
      <p class={`store-tooltip-name rarity-text--${rarity}`}>{item.name}</p>
      {item.enchants?.map((line) => <p class="store-tooltip-enchant" key={line}>{line}</p>)}
      {item.lore?.length > 0 && (
        <div class="store-tooltip-lore">
          {item.lore.map((line, i) => (line ? <p key={i}>{line}</p> : <p key={i} class="store-tooltip-gap" />))}
        </div>
      )}
    </div>
  );
}

// Tiles sit in a dense grid. An opened tooltip spans the full row directly after
// its tile, and `grid-auto-flow: dense` lets the following tiles fill the cells
// it would otherwise leave empty. That keeps the detail next to what was tapped
// without a floating layer, which the popout's `overflow: hidden` would clip and
// which has no hover to open it on a phone.
function ItemGrid({ items, rarity = 'common' }) {
  const [open, setOpen] = useState(null);
  return (
    <div class="store-items">
      {items.map((item, i) => {
        const hasDetail = Boolean(item.enchants?.length || item.lore?.length);
        const isOpen = open === i;
        const body = (
          <>
            <span class="store-item-icon">
              <StoreIcon icon={item.icon} name={item.name} glow={item.glow} />
              {item.qty > 1 && <span class="store-item-qty">{item.qty}</span>}
            </span>
            <span class="store-item-name">{item.name}</span>
          </>
        );
        return (
          <Fragment key={i}>
            {hasDetail ? (
              <button type="button" class={`store-item store-item--button${isOpen ? ' is-open' : ''}`}
                aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
                {body}
              </button>
            ) : (
              <div class="store-item">{body}</div>
            )}
            {isOpen && <ItemTooltip item={item} rarity={rarity} />}
          </Fragment>
        );
      })}
    </div>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;

function RewardsBlock({ block }) {
  return (
    <section class="store-block">
      {block.title && <h3 class="store-block-title">{block.title}</h3>}
      {block.note && <p class="store-block-note store-block-note--strong">{block.note}</p>}
      {block.groups.map((group) => {
        // A tier whose in-game name is a gradient (Chroma, Hallowed, 1 of 1)
        // brings its two colours with it; the plain tiers use the fixed palette.
        const custom = group.colors?.every((c) => HEX.test(c));
        const rarity = custom ? 'gradient' : slug(group.rarity);
        const style = custom ? `--rarity:${group.colors[0]};--rarity-b:${group.colors[1]}` : undefined;
        return (
          <div class={`store-rarity store-rarity--${rarity}`} style={style} key={group.label}>
            <p class="store-rarity-head">
              <span class={`store-rarity-label rarity-text--${rarity}`}>{group.label}</span>
              <span class="store-rarity-count">{group.items.length}</span>
            </p>
            <ItemGrid items={group.items} rarity={rarity} />
          </div>
        );
      })}
    </section>
  );
}

function KitBlock({ block }) {
  return (
    <section class="store-block store-kit">
      <p class="store-kit-head">
        <code class="store-kit-command">{block.command}</code>
        <span class="store-kit-cooldown">{block.cooldown}</span>
      </p>
      <ItemGrid items={block.items} />
    </section>
  );
}

function PerksBlock({ block }) {
  return (
    <section class="store-block">
      {block.title && <h3 class="store-block-title">{block.title}</h3>}
      {block.note && <p class="store-block-note">{block.note}</p>}
      <ul class="store-perks">
        {block.items.map((perk, i) => (
          <li class="store-perk" key={i}>
            {perk.icon && <StoreIcon icon={perk.icon} name={perk.text} size={24} />}
            <span class="store-perk-text">
              <PerkText text={perk.text} />
              {perk.detail && (
                <span class="store-perk-detail">
                  {perk.detail.startsWith('/') ? <code class="store-cmd">{perk.detail}</code> : perk.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// A cell is a string, or a list of strings stacked one per line (a battle pass
// tier with several rewards).
function Cell({ value }) {
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return <span class="store-table-empty">-</span>;
  return value.map((line, i) => <span class="store-table-line" key={i}>{line}</span>);
}

function TableBlock({ block }) {
  return (
    <section class="store-block">
      {block.title && <h3 class="store-block-title">{block.title}</h3>}
      {/* The popout is narrow; a wide table scrolls inside its own box rather
          than pushing the whole popout sideways. */}
      <div class="store-table-wrap">
        <table class="store-table">
          <thead>
            <tr>{block.columns.map((col) => <th key={col}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((value, c) => (c === 0
                  ? <th scope="row" key={c}><Cell value={value} /></th>
                  : <td key={c}><Cell value={value} /></td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const BLOCKS = {
  text: ({ block }) => <p class="store-text">{block.text}</p>,
  rewards: RewardsBlock,
  kit: KitBlock,
  perks: PerksBlock,
  table: TableBlock,
};

/** Renders generated store content. Unknown block types are skipped, so newer content never breaks an older build. */
export function RichDescription({ blocks }) {
  return (
    <div class="store-rich">
      {blocks.map((block, i) => {
        const Block = BLOCKS[block.type];
        return Block ? <Block block={block} key={i} /> : null;
      })}
    </div>
  );
}
