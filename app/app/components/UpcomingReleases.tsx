'use client';

import ModelCard from './ModelCard';

const upcomingModels = [
  {
    id: '1',
    name: 'Red Bull Racing RB20 - Max Verstappen - Winner Bahrain GP 2024',
    manufacturer: 'Spark',
    year: 2024,
    driver: 'Max Verstappen',
    team: 'Red Bull Racing',
    releaseDate: 'Jul 2024',
    imageUrl: '',
  },
  {
    id: '2',
    name: 'Ferrari SF-24 - Charles Leclerc - Monaco GP 2024',
    manufacturer: 'Looksmart',
    year: 2024,
    driver: 'Charles Leclerc',
    team: 'Scuderia Ferrari',
    releaseDate: 'Aug 2024',
    imageUrl: '',
  },
  {
    id: '3',
    name: 'Mercedes W15 - Lewis Hamilton - British GP 2024',
    manufacturer: 'Minichamps',
    year: 2024,
    driver: 'Lewis Hamilton',
    team: 'Mercedes-AMG Petronas',
    releaseDate: 'Sep 2024',
    imageUrl: '',
  },
  {
    id: '4',
    name: 'McLaren MCL38 - Lando Norris - Miami GP Winner 2024',
    manufacturer: 'Spark',
    year: 2024,
    driver: 'Lando Norris',
    team: 'McLaren F1 Team',
    releaseDate: 'Oct 2024',
    imageUrl: '',
  },
  {
    id: '5',
    name: 'Aston Martin AMR24 - Fernando Alonso - Testing 2024',
    manufacturer: 'Spark',
    year: 2024,
    driver: 'Fernando Alonso',
    team: 'Aston Martin',
    releaseDate: 'Nov 2024',
    imageUrl: '',
  },
];

export default function UpcomingReleases() {
  return (
    <section className="bg-[var(--section-bg)] py-16 px-8">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-display font-black text-3xl text-[var(--text-primary)] mb-1">
              Upcoming Releases
            </h2>
            <p className="text-[var(--text-tertiary)] text-sm">
              Pre-order the latest models before they sell out
            </p>
          </div>
          <a
            href="/upcoming"
            className="text-[var(--accent)] font-semibold text-sm hover:underline"
          >
            View all →
          </a>
        </div>

        <div
          className="flex gap-5 overflow-x-auto pb-4"
          data-hscroll
          style={{ scrollbarGutter: 'stable' }}
        >
          {upcomingModels.map((model) => (
            <div key={model.id} className="flex-none w-[280px]">
              <ModelCard {...model} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
