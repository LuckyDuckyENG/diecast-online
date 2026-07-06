'use client';

import Link from 'next/link';

interface RelatedModel {
  id: string;
  name: string;
  manufacturer: string;
  scale: string;
  price: string;
  imageUrl?: string;
}

interface RelatedModelsProps {
  models: RelatedModel[];
}

export default function RelatedModels({ models }: RelatedModelsProps) {
  // If no related models, show empty state
  if (!models || models.length === 0) {
    return (
      <section className="mb-16">
        <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mb-6">
          Other Versions of This Car
        </h2>
        <div className="bg-white border border-[var(--border-light)] rounded-xl p-8 text-center">
          <p className="text-[var(--text-tertiary)]">No related models available yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-16">
      <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mb-6">
        Other Versions of This Car
      </h2>

      <div
        className="flex gap-5 overflow-x-auto pb-4"
        data-hscroll
        style={{ scrollbarGutter: 'stable' }}
      >
        {models.map((model) => (
          <Link
            key={model.id}
            href={`/models/${model.id}`}
            className="flex-none w-[280px] group"
          >
            <div className="bg-white border border-[var(--border-light)] rounded-xl overflow-hidden hover:shadow-lg hover:border-[var(--border-medium)] transition-all">
              {/* Image */}
              <div className="aspect-[4/3] bg-[#efeee9] relative overflow-hidden">
                {model.imageUrl ? (
                  <img
                    src={model.imageUrl}
                    alt={model.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                    No Image
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block bg-[var(--text-primary)] text-white text-xs font-bold px-2 py-1 rounded">
                    {model.scale}
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-tertiary)]">
                    {model.manufacturer}
                  </span>
                </div>

                <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 line-clamp-2">
                  {model.name}
                </h3>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-primary)] font-bold text-lg">{model.price}</span>
                  <button className="bg-[var(--accent)] text-white font-bold text-xs px-4 py-2 rounded-lg hover:brightness-[0.92] transition-all">
                    View
                  </button>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
