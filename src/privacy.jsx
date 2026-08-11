import { render } from 'preact';
import { PrivacyPage } from './pages/PrivacyPage';
import './index.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

initAnalytics();
render(<PrivacyPage />, document.getElementById('app'));
