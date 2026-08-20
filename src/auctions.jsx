import { render } from 'preact';
import { AuctionsPage } from './pages/AuctionsPage';
import './index.css';
import './market.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

initAnalytics();
render(<AuctionsPage />, document.getElementById('app'));
