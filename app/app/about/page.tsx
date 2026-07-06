import { Metadata } from 'next';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'About - Diecasts',
  description: 'Learn about Diecasts - The F1 Diecast Price Index',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="font-display font-black text-[48px] md:text-[56px] leading-[1.1] tracking-tight text-[var(--text-primary)] mb-6">
          About Diecasts
        </h1>

        <div className="prose prose-lg max-w-none space-y-6 text-[var(--text-secondary)]">
          <p className="text-xl text-[var(--text-primary)] font-semibold">
            The F1 diecast price index.
          </p>

          <p>
            Diecasts is building the most comprehensive price comparison platform for Formula 1 scale models. We aggregate pricing data from top retailers worldwide to help collectors find the best deals and track their favorite models.
          </p>

          <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">
            What We Do
          </h2>

          <ul className="space-y-3 list-disc list-inside">
            <li><strong>Price Comparison:</strong> Compare prices across multiple retailers in one place</li>
            <li><strong>Pricing Database:</strong> Track historical prices and availability</li>
            <li><strong>Model Discovery:</strong> Find every scale model from manufacturers like Spark, Minichamps, Looksmart, BBR, and more</li>
            <li><strong>Growing Catalog:</strong> Starting with 2024 race-winning cars, expanding to the complete F1 diecast universe</li>
          </ul>

          <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">
            For Collectors
          </h2>

          <p>
            We're collectors too. We know how frustrating it is to hunt across dozens of websites to find the best price on a model. Diecasts solves this by bringing all the data together.
          </p>

          <p>
            Our goal is to become the <strong>Bloomberg terminal for F1 diecast</strong> - the definitive source for pricing intelligence in the scale model market.
          </p>

          <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">
            Early Days
          </h2>

          <p>
            Diecasts is in early development. We're launching with 2024 race-winning cars and building the foundation for a much larger catalog. If you're a collector who wants to help shape this platform, we'd love to hear from you.
          </p>

          <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">
            For Retailers
          </h2>

          <p>
            We drive traffic to specialty retailers and help grow the F1 collecting community. If you sell F1 diecast models, visit our{' '}
            <a href="/retailers" className="text-[var(--accent)] underline hover:no-underline">
              For Retailers
            </a>{' '}
            page to learn more.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
