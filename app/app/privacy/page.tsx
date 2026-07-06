import { Metadata } from 'next';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy - Master Release',
  description: 'Privacy Policy for Master Release - F1 Diecast Price Comparison',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="font-display font-black text-[48px] md:text-[56px] leading-[1.1] tracking-tight text-[var(--text-primary)] mb-6">
          Privacy Policy
        </h1>

        <div className="prose prose-lg max-w-none space-y-6 text-[var(--text-secondary)]">
          <p className="mb-6">
            <strong>Last Updated:</strong> July 5, 2026
          </p>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-8 mb-4">1. Information We Collect</h2>
            <p className="mb-4">
              Master Release is designed to respect your privacy. We collect minimal information:
            </p>
            <ul className="space-y-3 list-disc list-inside mb-4">
              <li><strong>No Personal Information:</strong> We do not collect names, email addresses, or any personally identifiable information</li>
              <li><strong>No Account Required:</strong> You can use Master Release without creating an account</li>
              <li><strong>Basic Analytics:</strong> We may use analytics to understand how visitors use our site (page views, browser type, general location)</li>
              <li><strong>No Tracking:</strong> We do not track users across other websites</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">2. Cookies</h2>
            <p className="mb-4">
              We may use minimal cookies for:
            </p>
            <ul className="space-y-3 list-disc list-inside mb-4">
              <li>Remembering your preferences (such as display settings)</li>
              <li>Basic analytics (if implemented)</li>
            </ul>
            <p className="mb-4">
              You can disable cookies in your browser settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">3. Third-Party Links</h2>
            <p className="mb-4">
              When you click on retailer links, you will leave Master Release and be subject to the privacy policies of those retailers. We are not responsible for the privacy practices of third-party websites.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">4. Data Security</h2>
            <p className="mb-4">
              Since we collect minimal data, there is minimal risk. However, we take reasonable precautions to protect any information we do collect.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">5. Data Retention</h2>
            <p className="mb-4">
              We retain pricing data and product information to provide historical price tracking. This data does not contain any personal information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">6. Children's Privacy</h2>
            <p className="mb-4">
              Master Release does not knowingly collect any information from children under 13.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">7. Changes to Privacy Policy</h2>
            <p className="mb-4">
              We may update this privacy policy from time to time. Changes will be posted on this page with an updated date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">8. Your Rights</h2>
            <p className="mb-4">
              Since we don't collect personal information, there is no personal data to access, correct, or delete. If you have questions about our data practices, please visit our <a href="/retailers" className="text-[var(--accent)] underline hover:no-underline">For Retailers</a> page for contact information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">9. Compliance</h2>
            <p className="mb-4">
              Our privacy practices are designed to comply with Australian privacy laws and international best practices.
            </p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
}
