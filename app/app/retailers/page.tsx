import { Metadata } from 'next';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'For Retailers - Master Release',
  description: 'Information for retailers about Master Release pricing data',
};

export default function RetailersPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="font-display font-black text-[48px] md:text-[56px] leading-[1.1] tracking-tight text-[var(--text-primary)] mb-6">
          For Retailers
        </h1>

        <div className="prose prose-lg max-w-none space-y-6 text-[var(--text-secondary)]">
          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-8 mb-4">Welcome to Master Release</h2>
            <p className="mb-4">
              Master Release is a free price comparison platform for F1 diecast collectors. We help enthusiasts discover race-winning models and find the best prices across multiple retailers worldwide.
            </p>
            <p className="mb-4">
              Our goal is to drive more traffic to specialty diecast retailers and grow the F1 collecting community.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">How It Works</h2>
            <p className="mb-4">
              We collect publicly available pricing information from online retailers to provide collectors with an easy way to compare prices. Our service:
            </p>
            <ul className="space-y-3 list-disc list-inside mb-4">
              <li>Links directly to your product pages</li>
              <li>Displays current pricing information</li>
              <li>Shows product images (via hotlinking - we never download or host your images)</li>
              <li>Updates prices periodically</li>
              <li>Includes links to your store for purchases</li>
            </ul>
            <p className="mb-4">
              <strong>We do not sell products.</strong> All purchases happen directly on your website.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">Benefits for Retailers</h2>
            <ul className="space-y-3 list-disc list-inside mb-4">
              <li><strong>Free Exposure:</strong> Your products are featured at no cost</li>
              <li><strong>Direct Traffic:</strong> Collectors click through to your website to make purchases</li>
              <li><strong>Community Growth:</strong> Help grow the F1 diecast collecting community</li>
              <li><strong>No Integration Required:</strong> We work with your existing online store</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">Content Removal Policy</h2>
            <p className="mb-4">
              We respect your rights as a retailer. If you would like your store removed from Master Release, we will comply immediately.
            </p>
            <p className="mb-4">
              <strong>To request removal:</strong>
            </p>
            <ol className="space-y-2 mb-4 list-decimal ml-6">
              <li>Send an email to: <a href="mailto:contact@masterrelease.com" className="text-[var(--accent)] underline hover:no-underline">contact@masterrelease.com</a></li>
              <li>Include your store name and URL</li>
              <li>We will remove all your products and pricing data within 48 hours</li>
            </ol>
            <p className="mb-4">
              No questions asked. No justification required.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">Want to Be Featured?</h2>
            <p className="mb-4">
              We're always looking to add more retailers to provide better coverage for collectors. If you sell F1 diecast models and would like to be included, please reach out:
            </p>
            <p className="mb-4">
              <a href="mailto:contact@masterrelease.com" className="text-[var(--accent)] underline hover:no-underline text-lg font-semibold">contact@masterrelease.com</a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">Price Accuracy</h2>
            <p className="mb-4">
              We make our best effort to keep pricing information current, but prices may change between updates. We always display a disclaimer that collectors should verify prices on your website before purchasing.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mt-12 mb-4">Questions?</h2>
            <p className="mb-4">
              For any questions about how we display your products, data accuracy, or anything else, please contact us at:
            </p>
            <p className="mb-4">
              <a href="mailto:contact@masterrelease.com" className="text-[var(--accent)] underline hover:no-underline text-lg font-semibold">contact@masterrelease.com</a>
            </p>
            <p className="mb-4 text-sm">
              (Note: This is an early version of Master Release. We're building this in the open with the community and welcome feedback from retailers and collectors alike.)
            </p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
}
