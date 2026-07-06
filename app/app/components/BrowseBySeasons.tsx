import Link from 'next/link';

const seasons = [
  { year: 2024, modelCount: 234, featured: true },
  { year: 2023, modelCount: 412, featured: true },
  { year: 2022, modelCount: 389, featured: false },
  { year: 2021, modelCount: 367, featured: false },
  { year: 2020, modelCount: 298, featured: false },
  { year: 2019, modelCount: 356, featured: false },
  { year: 2018, modelCount: 342, featured: false },
  { year: 2017, modelCount: 329, featured: false },
  { year: 2016, modelCount: 318, featured: false },
  { year: 2015, modelCount: 301, featured: false },
  { year: 2014, modelCount: 287, featured: false },
  { year: 2013, modelCount: 276, featured: false },
];

export default function BrowseBySeasons() {
  return (
    <section className="bg-[var(--section-bg)] py-16 px-8">
      <div className="max-w-[1240px] mx-auto">
        <div className="mb-8">
          <h2 className="font-display font-black text-3xl text-[var(--text-primary)] mb-1">
            Browse by Season
          </h2>
          <p className="text-[var(--text-tertiary)] text-sm">
            Explore models from every F1 season
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {seasons.map((season) => (
            <Link
              key={season.year}
              href={`/season/${season.year}`}
              className={`group relative overflow-hidden rounded-xl border transition-all duration-200 ${
                season.featured
                  ? 'bg-white border-[var(--border-default)] hover:border-[var(--accent)] hover:shadow-lg'
                  : 'bg-white/70 border-[var(--border-light)] hover:border-[var(--border-medium)] hover:bg-white'
              }`}
            >
              <div className="p-6">
                <div
                  className={`font-display font-black text-4xl mb-1 transition-colors ${
                    season.featured
                      ? 'text-[var(--text-primary)] group-hover:text-[var(--accent)]'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  {season.year}
                </div>
                <div className="text-[var(--text-tertiary)] text-sm font-medium">
                  {season.modelCount} models
                </div>
              </div>

              {season.featured && (
                <div className="absolute top-3 right-3">
                  <span className="inline-flex items-center justify-center w-2 h-2 bg-[var(--accent)] rounded-full" />
                </div>
              )}

              <div
                className={`absolute inset-x-0 bottom-0 h-1 transition-all duration-200 ${
                  season.featured ? 'bg-[var(--accent)]' : 'bg-[var(--border-medium)] group-hover:bg-[var(--accent)]'
                }`}
              />
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/seasons"
            className="inline-flex items-center gap-2 text-[var(--accent)] font-semibold text-sm hover:underline"
          >
            View all seasons from 1950 to today
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
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
