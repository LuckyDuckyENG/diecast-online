import Link from 'next/link';
import type { RelatedGroup } from '@/lib/relatedCars';

/**
 * Related cars, shown below the variants and above the price disclaimer.
 *
 * Anchor text is the full car title rather than "view" — it reads better for a
 * person and the wording is a genuine relevance signal for the destination page.
 */
export default function RelatedCars({ groups }: { groups: RelatedGroup[] }) {
  if (!groups.length) return null;

  return (
    <section className="mt-16 pt-10 border-t border-[var(--border-light)]">
      <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mb-8">
        You might also like
      </h2>

      <div className="space-y-10">
        {groups.map(group => (
          <div key={group.heading}>
            <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
              {group.heading}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.cars.map(car => (
                <Link
                  key={car.id}
                  href={`/cars/${car.slug || car.id}`}
                  className="group flex gap-4 items-center bg-white border border-[var(--border-light)] rounded-xl p-3 hover:shadow-md hover:border-[var(--border-medium)] transition-all"
                >
                  <div className="w-20 h-16 shrink-0 rounded-lg bg-[#efeee9] overflow-hidden flex items-center justify-center">
                    {car.imageUrl ? (
                      <img
                        src={car.imageUrl}
                        alt={car.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)] px-1 text-center">
                        No image
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-[var(--text-primary)] leading-snug line-clamp-2">
                      {car.title}
                    </p>
                    {car.lowestPrice !== null ? (
                      <p className="text-sm font-bold text-[var(--accent)] mt-1">
                        from AUD ${car.lowestPrice.toFixed(2)}
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        {car.hasStore ? 'Check price' : 'Not yet listed'}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
