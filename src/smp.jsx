import { render } from 'preact';
import { SmpPage } from './pages/SmpPage';
import './index.css';
import './lib/ditherBg';

render(<SmpPage />, document.getElementById('app'));
