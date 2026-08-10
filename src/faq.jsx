import { render } from 'preact';
import { FaqPage } from './pages/FaqPage';
import './index.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

initAnalytics();
render(<FaqPage />, document.getElementById('app'));
