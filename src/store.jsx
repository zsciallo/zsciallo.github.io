import { render } from 'preact';
import { StorePage } from './pages/StorePage';
import './index.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

initAnalytics();
render(<StorePage />, document.getElementById('app'));
