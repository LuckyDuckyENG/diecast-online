interface KeyDetailsProps {
  year: number;
  driver: string;
  team: string;
  grandPrix: string;
  scale: string;
  material: string;
  manufacturer: string;
  articleNumber: string;
  productionNumber: string;
  releaseDate: string;
  specialLivery: boolean;
}

export default function KeyDetails({
  year,
  driver,
  team,
  grandPrix,
  scale,
  material,
  manufacturer,
  articleNumber,
  productionNumber,
  releaseDate,
  specialLivery,
}: KeyDetailsProps) {
  const details = [
    { label: 'Year', value: year },
    { label: 'Driver', value: driver },
    { label: 'Team', value: team },
    { label: 'Grand Prix', value: grandPrix },
    { label: 'Scale', value: scale },
    { label: 'Material', value: material },
    { label: 'Manufacturer', value: manufacturer },
    { label: 'Article Number', value: articleNumber },
    { label: 'Production Number', value: productionNumber },
    { label: 'Release Date', value: releaseDate },
    { label: 'Special Livery', value: specialLivery ? 'Yes' : 'No' },
  ];

  return (
    <section className="mb-16">
      <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mb-6">
        Key Details
      </h2>

      <div className="bg-white border border-[var(--border-light)] rounded-xl overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {details.map((detail, index) => (
            <div
              key={detail.label}
              className={`flex items-start gap-4 p-5 ${
                index % 2 === 0 ? 'md:border-r border-[var(--border-light)]' : ''
              } ${index < details.length - 2 ? 'border-b border-[var(--border-light)]' : ''} ${
                index === details.length - 1 && details.length % 2 !== 0 ? 'md:col-span-2' : ''
              }`}
            >
              <dt className="font-semibold text-sm text-[var(--text-tertiary)] uppercase tracking-wide min-w-[140px]">
                {detail.label}
              </dt>
              <dd className="font-medium text-base text-[var(--text-primary)] flex-1">
                {detail.value}
              </dd>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
