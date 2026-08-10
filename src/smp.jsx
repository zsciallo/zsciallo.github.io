import { render } from 'preact';
import { SmpPage } from './pages/SmpPage';
import './index.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

initAnalytics();
render(<SmpPage />, document.getElementById('app'));
