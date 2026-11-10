import { render } from 'preact';
import { PvpPlayerPage } from './pages/PvpPlayerPage';
import './index.css';
import './pvp.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

initAnalytics();
render(<PvpPlayerPage />, document.getElementById('app'));
