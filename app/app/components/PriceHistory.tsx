'use client';

interface PriceHistoryProps {
  priceHistory: { month: string; price: number }[];
  currency: string;
}

export default function PriceHistory({ priceHistory, currency }: PriceHistoryProps) {
  // If no price history, show empty state
  if (!priceHistory || priceHistory.length === 0) {
    return (
      <section className="mb-16">
        <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mb-6">
          Price History
        </h2>
        <div className="bg-white border border-[var(--border-light)] rounded-xl p-8 text-center">
          <p className="text-[var(--text-tertiary)]">No price history available yet.</p>
        </div>
      </section>
    );
  }

  const prices = priceHistory.map((p) => p.price);
  const low = Math.min(...prices);
  const average = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const high = Math.max(...prices);

  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const range = maxPrice - minPrice;

  return (
    <section className="mb-16">
      <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mb-6">
        Price History
      </h2>

      <div className="bg-white border border-[var(--border-light)] rounded-xl p-8">
        {/* Simple Line Chart */}
        <div className="mb-8">
          <div className="relative h-[240px] flex items-end justify-between gap-2 px-4">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-[var(--text-muted)] pr-2">
              <span>{currency}{maxPrice}</span>
              <span>{currency}{Math.round((maxPrice + minPrice) / 2)}</span>
              <span>{currency}{minPrice}</span>
            </div>

            {/* Bars */}
            <div className="flex-1 flex items-end justify-between gap-1 ml-12">
              {priceHistory.map((data, index) => {
                const heightPercent = ((data.price - minPrice) / range) * 100;
                const isHighest = data.price === maxPrice;
                const isLowest = data.price === minPrice;

                return (
                  <div key={data.month} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex items-end justify-center" style={{ height: '200px' }}>
                      <div
                        className={`w-full rounded-t transition-all ${
                          isHighest
                            ? 'bg-[var(--accent)]'
                            : isLowest
                            ? 'bg-[var(--text-muted)]'
                            : 'bg-[var(--border-medium)]'
                        } hover:opacity-80 cursor-pointer relative group`}
                        style={{ height: `${heightPercent}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--text-primary)] text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {currency}{data.price}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-[var(--text-tertiary)] font-medium">{data.month}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stats Boxes */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-[var(--section-bg)] rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-1">
              Low
            </p>
            <p className="font-display font-black text-2xl text-[var(--text-primary)]">
              {currency}
              {low}
            </p>
          </div>
          <div className="bg-[var(--section-bg)] rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-1">
              Average
            </p>
            <p className="font-display font-black text-2xl text-[var(--text-primary)]">
              {currency}
              {average}
            </p>
          </div>
          <div className="bg-[var(--section-bg)] rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-1">
              High
            </p>
            <p className="font-display font-black text-2xl text-[var(--text-primary)]">
              {currency}
              {high}
            </p>
          </div>
        </div>

        <p className="text-sm text-[var(--text-muted)] text-center">
          Based on recent sold listings
        </p>
      </div>
    </section>
  );
}
