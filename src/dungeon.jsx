import { render } from 'preact';
import { DungeonPage } from './pages/DungeonPage';
import './index.css';
import './dungeon.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

initAnalytics();
render(<DungeonPage />, document.getElementById('app'));
