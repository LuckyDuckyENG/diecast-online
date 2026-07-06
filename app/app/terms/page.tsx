import { Metadata } from 'next';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service - Master Release',
  description: 'Terms of Service for Master Release - F1 Diecast Price Comparison',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="font-display font-black text-[48px] md:text-[56px] leading-[1.1] tracking-tight text-[var(--text-primary)] mb-6">
          Terms of Service
        </h1>

        <div className="prose prose-lg max-w-none space-y-6 text-[var(--text-secondary)]">
          <p className="mb-6">
            <strong>Last Updated:</strong> July 5, 2026
          </p>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-8 mb-4">1. About Master Release</h2>
            <p className="mb-4">
              Master Release is a price comparison platform for F1 diecast models. We aggregate publicly available pricing information from various online retailers to help collectors find the best deals.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">2. Price Information Disclaimer</h2>
            <p className="mb-4">
              <strong>All prices displayed on Master Release are indicative only and may not reflect current retail prices.</strong>
            </p>
            <ul className="space-y-3 list-disc list-inside mb-4">
              <li>Prices are collected automatically and may be out of date</li>
              <li>Retailers may change prices at any time without notice</li>
              <li>Stock availability is not guaranteed</li>
              <li>Currency conversions are approximate and may differ from actual exchange rates</li>
              <li>Shipping costs, taxes, and duties are NOT included in displayed prices</li>
            </ul>
            <p className="mb-4">
              <strong>Always verify the current price and availability directly on the retailer's website before making a purchase.</strong>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">3. No Purchase Transactions</h2>
            <p className="mb-4">
              Master Release does not sell products. We are purely a comparison tool. All purchases must be made directly with retailers. We are not responsible for:
            </p>
            <ul className="space-y-3 list-disc list-inside mb-4">
              <li>Product quality or authenticity</li>
              <li>Shipping delays or issues</li>
              <li>Retailer customer service</li>
              <li>Returns, refunds, or exchanges</li>
              <li>Any disputes between you and retailers</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">4. No Warranty</h2>
            <p className="mb-4">
              Master Release is provided "as is" without any warranties. We make no guarantees about:
            </p>
            <ul className="space-y-3 list-disc list-inside mb-4">
              <li>Accuracy of pricing information</li>
              <li>Availability of products</li>
              <li>Reliability of retailer links</li>
              <li>Completeness of product listings</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">5. Limitation of Liability</h2>
            <p className="mb-4">
              To the maximum extent permitted by law, Master Release and its operators shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of this website or reliance on any pricing information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">6. Intellectual Property</h2>
            <p className="mb-4">
              Product images and descriptions are owned by their respective manufacturers and retailers. We display this content for informational purposes only under fair use principles. All trademarks belong to their respective owners.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">7. Changes to Terms</h2>
            <p className="mb-4">
              We may update these terms at any time. Continued use of the website constitutes acceptance of updated terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">8. Contact</h2>
            <p className="mb-4">
              For questions about these terms, please visit our <a href="/retailers" className="text-[var(--accent)] underline hover:no-underline">For Retailers</a> page.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">9. Governing Law</h2>
            <p className="mb-4">
              These terms are governed by the laws of Australia.
            </p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
}
