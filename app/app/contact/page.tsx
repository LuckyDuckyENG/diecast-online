import { Metadata } from 'next';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'Contact - Master Release',
  description: 'Get in touch with Master Release',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="font-display font-black text-[48px] md:text-[56px] leading-[1.1] tracking-tight text-[var(--text-primary)] mb-6">
          Contact
        </h1>

        <div className="prose prose-lg max-w-none space-y-6 text-[var(--text-secondary)]">
          <p className="text-xl">
            We'd love to hear from you.
          </p>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-8 mb-4">Get in Touch</h2>
            <p className="mb-4">
              For general inquiries, feedback, retailer questions, or anything else:
            </p>
            <p className="mb-6">
              <a href="mailto:contact@masterrelease.com" className="text-[var(--accent)] underline hover:no-underline text-2xl font-semibold">
                contact@masterrelease.com
              </a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">For Retailers</h2>
            <p className="mb-4">
              If you're a retailer and want to learn more about Master Release or request removal of your store, please visit our{' '}
              <a href="/retailers" className="text-[var(--accent)] underline hover:no-underline">
                For Retailers
              </a>{' '}
              page.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">Early Days</h2>
            <p className="mb-4">
              Master Release is in early development. We're building this platform for the F1 diecast collecting community and would love your feedback on how we can make it better.
            </p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
}
