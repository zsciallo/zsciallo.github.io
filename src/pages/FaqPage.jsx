import config from '../config.json';
import { useServerStatus } from '../hooks/useServerStatus';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { StatusBadge } from '../components/StatusBadge';
import { ServerStatusSection } from '../components/ServerStatusSection';
import { JoinCTA } from '../components/JoinCTA';
import { SectionHeader } from '../components/SectionHeader';
import { FaqItem } from '../components/FaqItem';
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';
import { MotionRoot } from '../lib/motion';
import faq from '../data/faq.json';

// Answers in faq.json use a tiny markdown: **bold**, `code` and [text](href).
// Anything else is plain text, which keeps the JSON readable and lets
// tools/build_faq_ld.py strip it the same way for the page's JSON-LD.
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function rich(text) {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const external = /^https?:/.test(link[2]);
      return <a key={i} href={link[2]} target={external ? '_blank' : undefined} rel={external ? 'noopener' : undefined}>{link[1]}</a>;
    }
    return part;
  });
}

export function FaqPage() {
  const status = useServerStatus(config.serverIP, config.underConstruction);
  useScrollReveal();

  return (
    <MotionRoot>
      <NavBar current="faq" />
      <main>
        <section class="page-hero container" aria-label="Chromabit SMP FAQ">
          <p class="section-eyebrow">HELP CENTER</p>
          <h1 class="hero-title">
            HAVE<span class="accent">QUESTIONS?</span>
          </h1>
          <p class="hero-sub">Everything you need to know about Chromabit Economy SMP.</p>

          <StatusBadge status={status} />

          <div class="rule" />

          <ServerStatusSection config={config} status={status} />
          <JoinCTA config={config} />

          <div class="rule" />
        </section>

        <section class="faq-section" aria-label="Frequently asked questions">
          <div class="container">
            <SectionHeader eyebrow="QUESTIONS" title="FAQ" />
            <div class="faq-list">
              {faq.groups.map((group) => (
                <div class="faq-group" id={group.id} key={group.id}>
                  <p class="faq-section-label">{group.title.toUpperCase()}</p>
                  {group.items.map((item) => (
                    <FaqItem question={item.q} key={item.q}>
                      {rich(item.a)}
                    </FaqItem>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </MotionRoot>
  );
}
