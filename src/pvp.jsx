import { render } from 'preact';
import { PvpPage } from './pages/PvpPage';
import './index.css';
import './pvp.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

initAnalytics();
render(<PvpPage />, document.getElementById('app'));
