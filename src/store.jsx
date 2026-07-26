import { render } from 'preact';
import { StorePage } from './pages/StorePage';
import './index.css';
import './lib/ditherBg';

render(<StorePage />, document.getElementById('app'));
