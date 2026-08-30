import config from '../config.json';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { SectionHeader } from '../components/SectionHeader';
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';

// Bump whenever the substance of the policy changes — not for typo fixes.
const LAST_UPDATED = 'August 10, 2026';

export function PrivacyPage() {
  // SectionHeader renders a `.reveal` element, which CSS pins at opacity 0
  // until the observer marks it visible.
  useScrollReveal();

  return (
    <>
      <NavBar />
      <main>
        <section class="page-hero container" aria-label="Chromabit SMP privacy policy">
          <a href="/" class="logo-link" aria-label="Back to Chromabit SMP home">
            <img class="logo-sm" src="/server-icon-old-2.png" alt="Chromabit SMP" />
          </a>

          <p class="section-eyebrow">LEGAL</p>
          <h1 class="hero-title hero-title--inline">
            PRIVACY <span class="accent">POLICY</span>
          </h1>
          <p class="hero-sub">How Chromabit handles your data on this website.</p>

          <div class="rule" />
        </section>

        <section class="legal-section" aria-label="Privacy policy">
          <div class="container">
            <SectionHeader eyebrow="LAST UPDATED" title={LAST_UPDATED.toUpperCase()} />

            <div class="legal">
              <p>
                This policy covers the website at <strong>chromabit.us</strong>, operated by
                Chromabit LLC ("we", "us"). It explains what we collect when you visit, why,
                and how to make us stop. It does not cover what happens in-game on
                {' '}<strong>{config.serverIP}</strong>, or on Discord.
              </p>

              <h2>The short version</h2>
              <p>
                We use privacy-focused analytics to see how many people visit the site and
                where they get stuck in the store. We do not record your screen, we do not
                sell data, we do not run advertising, and we never send your Minecraft
                username to our analytics provider. Payments are handled entirely by Tebex —
                we never see or store your card details.
              </p>

              <h2>What we collect</h2>
              <p>
                We use <a href="https://posthog.com" target="_blank" rel="noopener">PostHog</a>,
                an analytics service, to understand how the site is used. On each visit it
                records:
              </p>
              <ul>
                <li>Pages you view on this site, and when</li>
                <li>The site or link that sent you here (referrer and any campaign tags)</li>
                <li>Approximate location — country and region, derived from your IP address</li>
                <li>Device information: browser, operating system, and screen size</li>
                <li>
                  Store activity: which packages you open, add to a cart, or begin checkout
                  for, and any errors you hit while trying to buy
                </li>
                <li>Clicks on page elements, used to spot broken or confusing controls</li>
              </ul>
              <p>
                <strong>We have session recording switched off.</strong> PostHog is capable of
                replaying a video of your screen; we have deliberately disabled it and do not
                collect those recordings.
              </p>
              <p>
                Analytics data is processed by PostHog on servers in the United States and is
                retained according to their standard retention period. We do not combine it
                with any other information about you.
              </p>

              <h2>What we do not collect</h2>
              <ul>
                <li>
                  <strong>Your Minecraft username.</strong> It is stored only in your own
                  browser so you don't have to retype it, and it is sent to Tebex to deliver
                  your purchase. It is never sent to our analytics provider.
                </li>
                <li>
                  <strong>Payment details.</strong> Checkout happens on Tebex's own systems.
                  We never receive your card number, billing address, or PayPal login.
                </li>
                <li>
                  <strong>Your name, email, or account passwords.</strong> This site has no
                  user accounts and no signup.
                </li>
              </ul>

              <h2>Cookies and local storage</h2>
              <p>
                PostHog sets a cookie so that repeat visits within a session are counted as
                one person rather than several. We also use your browser's local storage to
                remember your Minecraft username and your current shopping cart, so they
                survive a page refresh. That local storage never leaves your device.
              </p>
              <p>
                You can clear both at any time through your browser's settings for this site.
                Doing so will empty your cart and make you retype your username.
              </p>

              <h2>Other services</h2>
              <ul>
                <li><strong>Tebex</strong> — runs our store and processes all payments.</li>
                <li><strong>GitHub Pages</strong> — hosts this website.</li>
                <li><strong>Google Fonts</strong> — serves the fonts used on these pages.</li>
                <li><strong>mcsrvstat.us</strong> — supplies the live player count.</li>
                <li><strong>Discord</strong> — supplies our community member count.</li>
              </ul>
              <p>
                Each of these receives your IP address as a normal part of serving you the
                page, and each has its own privacy policy governing what it does with it.
              </p>

              <h2>Children</h2>
              <p>
                Minecraft has a large young audience, and we take that seriously. This site is
                not directed at children under 13, and we do not knowingly collect personal
                information from them. We have disabled session recording partly for this
                reason.
              </p>
              <p>
                If you are a parent or guardian and believe your child has provided us with
                information, contact us and we will delete it. If you are under 13, please ask
                a parent before making a purchase.
              </p>

              <h2>Your choices</h2>
              <p>
                You can opt out of analytics entirely by turning on "Do Not Track" or "Global
                Privacy Control" in your browser, or by using any standard content blocker —
                we do not attempt to work around blockers.
              </p>
              <p>
                Depending on where you live, you may have the right to access, correct, or
                delete the data we hold, or to object to its processing. Because we collect no
                names or email addresses, we usually cannot connect analytics data to you
                personally — but contact us and we will do what we can.
              </p>

              <h2>Changes</h2>
              <p>
                If we change this policy we will update the date at the top of this page.
                Continuing to use the site after a change means you accept the updated policy.
              </p>

              <h2>Contact</h2>
              <p>
                Questions about this policy, or a data request? Reach us in the
                {' '}<a href={config.discord} target="_blank" rel="noopener">Chromabit Discord</a>
                {' '}and open a ticket.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
