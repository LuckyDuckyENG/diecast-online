interface Retailer {
  name: string;
  price: number;
  currency: string;
  availability: 'In Stock' | 'Pre-order' | 'Out of Stock';
  url: string;
}

interface WhereToBuyProps {
  retailers: Retailer[];
}

export default function WhereToBuy({ retailers }: WhereToBuyProps) {
  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case 'In Stock':
        return 'text-green-600 bg-green-50';
      case 'Pre-order':
        return 'text-blue-600 bg-blue-50';
      case 'Out of Stock':
        return 'text-gray-500 bg-gray-50';
      default:
        return 'text-gray-500 bg-gray-50';
    }
  };

  // If no retailers, show empty state
  if (!retailers || retailers.length === 0) {
    return (
      <section className="mb-16">
        <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mb-6">
          Where to Buy
        </h2>
        <div className="bg-white border border-[var(--border-light)] rounded-xl p-8 text-center">
          <p className="text-[var(--text-tertiary)]">No retailers available for this model yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-16">
      <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mb-6">
        Where to Buy
      </h2>

      <div className="bg-white border border-[var(--border-light)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--section-bg)]">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wide">
                  Retailer
                </th>
                <th className="text-left px-6 py-4 text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wide">
                  Price
                </th>
                <th className="text-left px-6 py-4 text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wide">
                  Availability
                </th>
                <th className="text-right px-6 py-4 text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wide">
                  Link
                </th>
              </tr>
            </thead>
            <tbody>
              {retailers.map((retailer, index) => (
                <tr
                  key={retailer.name}
                  className={`${
                    index !== retailers.length - 1 ? 'border-b border-[var(--border-light)]' : ''
                  } hover:bg-[var(--background)] transition-colors`}
                >
                  <td className="px-6 py-5">
                    <span className="font-semibold text-[var(--text-primary)]">{retailer.name}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="font-bold text-lg text-[var(--text-primary)]">
                      {retailer.currency}
                      {retailer.price}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getAvailabilityColor(
                        retailer.availability
                      )}`}
                    >
                      {retailer.availability}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <a
                      href={retailer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-[var(--accent)] text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:brightness-[0.92] transition-all"
                    >
                      Visit Store
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 bg-[var(--section-bg)] border-t border-[var(--border-light)]">
          <p className="text-sm text-[var(--text-muted)]">
            <span className="font-semibold">Note:</span> Prices updated regularly. We may earn a
            commission from purchases made through these links.
          </p>
        </div>
      </div>
    </section>
  );
}
