import { render } from 'preact';
import { NavBar } from './components/NavBar';
import { MotionRoot } from './lib/motion';
import './index.css';
import './wiki.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

// Wiki pages are static HTML from ssg.js: only the nav and the home page's title filter need script.
initAnalytics();
render(<MotionRoot><NavBar current="wiki" /></MotionRoot>, document.getElementById('wiki-nav'));

const filter = document.getElementById('wiki-filter');
filter?.addEventListener('input', () => {
  const q = filter.value.trim().toLowerCase();
  for (const tile of document.querySelectorAll('[data-wiki-title]')) tile.hidden = !tile.dataset.wikiTitle.includes(q);
});
