import ModelCard from './ModelCard';

const latestModels = [
  {
    id: '6',
    name: 'McLaren MP4/4 - Ayrton Senna - Winner Monaco GP 1988',
    manufacturer: 'Minichamps',
    year: 1988,
    driver: 'Ayrton Senna',
    team: 'McLaren Honda',
    price: '€89.95',
    imageUrl: '',
  },
  {
    id: '7',
    name: 'Ferrari F2004 - Michael Schumacher - World Champion 2004',
    manufacturer: 'BBR',
    year: 2004,
    driver: 'Michael Schumacher',
    team: 'Scuderia Ferrari',
    price: '€449.00',
    imageUrl: '',
  },
  {
    id: '8',
    name: 'Mercedes W11 - Lewis Hamilton - Turkish GP Winner 2020',
    manufacturer: 'Spark',
    year: 2020,
    driver: 'Lewis Hamilton',
    team: 'Mercedes-AMG Petronas',
    price: '€79.90',
    imageUrl: '',
  },
  {
    id: '9',
    name: 'Red Bull RB18 - Sergio Perez - Monaco GP 2022',
    manufacturer: 'Spark',
    year: 2022,
    driver: 'Sergio Perez',
    team: 'Red Bull Racing',
    price: '€84.95',
    imageUrl: '',
  },
  {
    id: '10',
    name: 'Williams FW14B - Nigel Mansell - World Champion 1992',
    manufacturer: 'Minichamps',
    year: 1992,
    driver: 'Nigel Mansell',
    team: 'Canon Williams Renault',
    price: '€94.50',
    imageUrl: '',
  },
  {
    id: '11',
    name: 'Lotus 72D - Emerson Fittipaldi - British GP 1972',
    manufacturer: 'Quartzo',
    year: 1972,
    driver: 'Emerson Fittipaldi',
    team: 'John Player Team Lotus',
    price: '€59.95',
    imageUrl: '',
  },
  {
    id: '12',
    name: 'Alpine A522 - Fernando Alonso - Hungarian GP 2022',
    manufacturer: 'Spark',
    year: 2022,
    driver: 'Fernando Alonso',
    team: 'BWT Alpine F1 Team',
    price: '€79.90',
    imageUrl: '',
  },
  {
    id: '13',
    name: 'Benetton B194 - Michael Schumacher - Monaco GP 1994',
    manufacturer: 'Minichamps',
    year: 1994,
    driver: 'Michael Schumacher',
    team: 'Mild Seven Benetton Ford',
    price: '€89.95',
    imageUrl: '',
  },
];

export default function LatestReleases() {
  return (
    <section className="bg-white py-16 px-8">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-display font-black text-3xl text-[var(--text-primary)] mb-1">
              Latest Releases
            </h2>
            <p className="text-[var(--text-tertiary)] text-sm">
              Recently added to the catalogue
            </p>
          </div>
          <a
            href="/browse"
            className="text-[var(--accent)] font-semibold text-sm hover:underline"
          >
            View all →
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {latestModels.map((model) => (
            <ModelCard key={model.id} {...model} />
          ))}
        </div>
      </div>
    </section>
  );
}
