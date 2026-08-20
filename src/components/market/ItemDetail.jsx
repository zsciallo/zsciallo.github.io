import { useState } from 'preact/hooks';
import { ago, count, enchantName, fullDate, money, percent, roman, sellerLabel, until } from '../../lib/market';
import { ItemIcon } from './ItemIcon';
import { PriceChart } from './PriceChart';

// Enough rows to read the shape of the book without turning the panel into a
// scroll trap; the count in the heading says how much is being held back.
const ROWS = 12;

export function ItemDetail({ item, now, loading, error, onBack }) {
  const [range, setRange] = useState('30d');

  if (loading) return <p class="market-status">Loading item…</p>;
  if (error) return <p class="market-status market-status--error">Couldn’t load that item. {error.message}</p>;
  if (!item) return null;

  const change = percent(item.changeWow);
  const direction = item.changeWow == null ? '' : item.changeWow > 0 ? ' up' : item.changeWow < 0 ? ' down' : '';
  const enchants = item.enchants?.length ? item.enchants : item.storedEnchants;

  return (
    <div class="detail">
      <button type="button" class="detail-back" onClick={onBack}>← All items</button>

      <header class="detail-head">
        <ItemIcon item={item} size={56} />
        <div class="detail-titles">
          <h2 class="detail-name">{item.name}</h2>
          <p class="detail-sub">
            {item.materialName !== item.name ? item.materialName : null}
            {!item.fungible && <span class="market-tag">variant</span>}
            <code class="detail-key">{item.key}</code>
          </p>
        </div>
      </header>

      {enchants?.length > 0 && (
        <ul class="detail-ench">
          {enchants.map((e) => (
            <li key={e.id}>{enchantName(e.id)} <b>{roman(e.level)}</b></li>
          ))}
        </ul>
      )}

      {item.contents?.length > 0 && (
        <div class="detail-contents">
          <h4>Contents</h4>
          <ul>
            {item.contents.map((c) => (
              <li key={c.id}><b>{c.count}×</b> {c.name}</li>
            ))}
          </ul>
        </div>
      )}

      <div class="stat-row">
        <Stat label="Listing floor" value={item.floor == null ? '—' : money(item.floor, { compact: false })}
          note={item.activeListings ? `${item.activeListings} listed now` : 'nothing listed'} />
        <Stat label="Last sale" value={item.lastSale ? money(item.lastSale.price, { compact: false }) : '—'}
          note={item.lastSale ? ago(item.lastSale.at, now) : 'no sales'} />
        <Stat label="7d average" value={item.vwap7d ? money(item.vwap7d, { compact: false }) : '—'}
          note={`${item.sales7d} sale${item.sales7d === 1 ? '' : 's'} this week`} />
        <Stat label="Week over week" value={change ?? '—'} tone={direction.trim()}
          note={change ? 'vs. prior 7 days' : 'too few sales to call'} />
        <Stat label="Total sales" value={count(item.salesAll)} note={`${count(item.sales30d)} in 30d`} />
        <Stat label="Lifetime volume" value={money(item.volumeAll)} note="value traded" />
      </div>

      <PriceChart history={item.history} range={range} onRange={setRange} />

      <div class="detail-cols">
        <Listings listings={item.listings} now={now} />
        <Sales sales={item.recentSales} now={now} />
      </div>

      {item.lore?.length > 0 && (
        <div class="detail-lore">
          <h4>Lore</h4>
          {item.lore.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, note, tone }) {
  return (
    <div class="stat">
      <p class="stat-label">{label}</p>
      <p class={`stat-value${tone ? ` change ${tone}` : ''}`}>{value}</p>
      {note && <p class="stat-note">{note}</p>}
    </div>
  );
}

function Listings({ listings, now }) {
  return (
    <section class="mini-table">
      <h4>Live listings <em>{listings.length}</em></h4>
      {listings.length === 0 ? (
        <p class="mini-empty">Nothing on the auction house right now.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Unit price</th><th class="num">Qty</th><th class="num">Total</th><th>Seller</th><th class="num">Ends</th></tr>
          </thead>
          <tbody>
            {listings.slice(0, ROWS).map((l, i) => (
              <tr key={i}>
                <td class="mono">{money(l.unitPrice, { compact: false })}</td>
                <td class="num">{l.count}</td>
                <td class="num mono">{money(l.totalPrice)}</td>
                <td class="seller">{sellerLabel(l.seller)}</td>
                <td class="num">{until(l.expiresAt, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {listings.length > ROWS && <p class="mini-more">+{listings.length - ROWS} more listings</p>}
    </section>
  );
}

function Sales({ sales, now }) {
  return (
    <section class="mini-table">
      <h4>Recent sales <em>{sales.length}</em></h4>
      {sales.length === 0 ? (
        <p class="mini-empty">No recorded sales yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Unit price</th><th class="num">Qty</th><th>Seller</th><th class="num">When</th></tr>
          </thead>
          <tbody>
            {sales.slice(0, ROWS).map((s, i) => (
              <tr key={i}>
                <td class="mono">{money(s.unitPrice, { compact: false })}</td>
                <td class="num">{s.count}</td>
                <td class="seller">{sellerLabel(s.seller)}</td>
                <td class="num" title={fullDate(s.at)}>{ago(s.at, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sales.length > ROWS && <p class="mini-more">+{sales.length - ROWS} more sales</p>}
    </section>
  );
}
