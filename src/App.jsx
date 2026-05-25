import config from './config.json';
import { Hero } from './components/Hero';
import { Events } from './components/Events';
import { Footer } from './components/Footer';
import { useServerStatus } from './hooks/useServerStatus';

export default function App() {
  const status = useServerStatus(config.serverIP, config.underConstruction);

  return (
    <>
      <main>
        <Hero config={config} status={status} />
        <Events prize={config.prize} discord={config.discord} />
      </main>
      <Footer />
    </>
  );
}
