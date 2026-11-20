import { render } from 'preact';
import { VotePage } from './pages/VotePage';
import './index.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

initAnalytics();
render(<VotePage />, document.getElementById('app'));
