import { ago, count, enchantName, money, percent, roman } from '../../lib/market';
import { ItemIcon } from './ItemIcon';
import { Sparkline } from './Sparkline';

/** The default view: every tracked item, ranked, scannable in one pass.
 *
 *  `now` is the snapshot's generation time, not the wall clock. The data is a
 *  point-in-time capture, so every "3d ago" on the page has to be measured from
 *  when it was captured or the whole list reads as stale by however long ago
 *  the generator last ran. */
export function MarketList({ items, now, onOpen }) {
  return (
    <div class="market-table" role="table" aria-label="Tracked auction items">
      <div class="market-row market-row--head" role="row">
        <span role="columnheader">Item</span>
        <span role="columnheader" class="num">Floor</span>
        <span role="columnheader" class="num">7d avg</span>
        <span role="columnheader" class="num">7d chg</span>
        <span role="columnheader" class="num">Sales</span>
        <span role="columnheader" class="num">Listed</span>
        <span role="columnheader" class="spark-col">Trend</span>
      </div>

      {items.map((item) => <MarketRow key={item.key} item={item} now={now} onOpen={onOpen} />)}
    </div>
  );
}

function MarketRow({ item, now, onOpen }) {
  const change = percent(item.changeWow);
  const direction = item.changeWow == null ? '' : item.changeWow > 0 ? ' up' : item.changeWow < 0 ? ' down' : '';
  // An enchanted book has no name of its own, so the generator names it after
  // what it stores. Repeating that below the title says the same thing twice.
  const showEnchants = item.enchants?.length
    && !item.name.includes(enchantName(item.enchants[0].id));

  return (
    <button type="button" class="market-row" role="row" onClick={() => onOpen(item.key)}>
      <span class="market-item" role="cell">
        <ItemIcon item={item} />
        <span class="market-item-text">
          <span class="market-name">{item.name}</span>
          <span class="market-sub">
            {(item.custom || !item.fungible) && item.materialName !== item.name ? item.materialName : null}
            {showEnchants ? (
              <span class="market-ench">
                {item.enchants.slice(0, 3).map((e) => `${enchantName(e.id)} ${roman(e.level)}`).join(' · ')}
                {item.enchants.length > 3 ? ` +${item.enchants.length - 3}` : ''}
              </span>
            ) : null}
            {!item.fungible && !item.enchants?.length && !item.custom
              ? <span class="market-tag">variant</span> : null}
          </span>
        </span>
      </span>

      <span class="num" role="cell">{item.floor == null ? <em>none</em> : money(item.floor)}</span>
      <span class="num" role="cell">{money(item.vwap7d ?? item.lastSale?.price)}</span>
      <span class={`num change${direction}`} role="cell">{change ?? '—'}</span>
      <span class="num" role="cell">
        {count(item.salesAll)}
        <em class="market-when">{item.lastSale ? ago(item.lastSale.at, now) : 'never'}</em>
      </span>
      <span class="num" role="cell">{item.activeListings || <em>0</em>}</span>
      <span class="spark-col" role="cell">
        <Sparkline points={item.spark} label={`${item.name} 14 day median price trend`} />
      </span>
    </button>
  );
}
