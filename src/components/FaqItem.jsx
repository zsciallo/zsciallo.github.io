export function FaqItem({ question, children }) {
  return (
    <details class="faq-item">
      <summary class="faq-question">{question}</summary>
      <div class="faq-answer">{children}</div>
    </details>
  );
}
