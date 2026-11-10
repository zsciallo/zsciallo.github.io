import config from './config.json';
import { useServerStatus } from './hooks/useServerStatus';
import { useScrollReveal } from './hooks/useScrollReveal';
import { JoinBox } from './components/JoinBox';
import { ClaimBand } from './components/ClaimBand';
import { ModeCards } from './components/ModeCards';
import { Footer } from './components/Footer';
import { NavBar } from './components/NavBar';
import { Logo } from './components/Logo';
import { MotionRoot } from './lib/motion';

export default function App() {
  const status = useServerStatus(config.serverIP, config.underConstruction);
  useScrollReveal();

  return (
    <MotionRoot>
      <NavBar current="home" />
      <main>
        <section class="page-hero container home-hero" aria-label="Chromabit Network">

          <Logo />

          <p class="section-eyebrow">MINECRAFT NETWORK · JAVA + BEDROCK</p>
          <h1 class="hero-title hero-title--inline">
            CHROMABIT <span class="accent">NETWORK</span>
          </h1>
          <p class="hero-tagline">
            Grind the market. <span class="accent">Climb the ladder.</span>
          </p>

          <JoinBox config={config} status={status} />
        </section>

        <section class="network-modes container" aria-label="Ways to play">
          <ClaimBand />
          <ModeCards />
        </section>
      </main>
      <Footer />
    </MotionRoot>
  );
}
