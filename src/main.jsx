import { render } from 'preact';
import App from './App';
import './index.css';
import './lib/ditherBg';
import { initAnalytics } from './lib/funnel';

initAnalytics();
render(<App />, document.getElementById('app'));
