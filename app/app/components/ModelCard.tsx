import Link from 'next/link';
import TeamColorFallback from './TeamColorFallback';

interface ModelCardProps {
  id: string;
  name: string;
  manufacturer: string;
  year: number;
  driver?: string;
  team?: string;
  price?: string;
  imageUrl?: string;
  releaseDate?: string;
  liveryName?: string;
  teamPrimaryColor?: string;
  teamTextColor?: string;
}

export default function ModelCard({
  id,
  name,
  manufacturer,
  year,
  driver,
  team,
  price,
  imageUrl,
  releaseDate,
  liveryName,
  teamPrimaryColor,
  teamTextColor,
}: ModelCardProps) {
  return (
    <Link
      href={`/cars/${id}`}
      className="group block bg-white border border-[var(--border-light)] rounded-[14px] overflow-hidden hover:shadow-lg hover:border-[var(--border-medium)] transition-all duration-200"
    >
      {/* Image */}
      <div className="aspect-[4/3] bg-[#efeee9] relative overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : team && liveryName && teamPrimaryColor && teamTextColor ? (
          <TeamColorFallback
            teamName={team}
            liveryName={liveryName}
            primaryColor={teamPrimaryColor}
            textColor={teamTextColor}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
            No Image
          </div>
        )}
        {releaseDate && (
          <div className="absolute top-3 right-3 bg-[var(--accent)] text-white text-xs font-bold px-2.5 py-1 rounded-md">
            {releaseDate}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-display font-bold text-[var(--text-primary)] text-base mb-1 line-clamp-2">
          {name}
        </h3>
        <p className="text-[var(--text-tertiary)] text-sm mb-3">
          {manufacturer} • {year}
          {driver && ` • ${driver}`}
          {team && ` • ${team}`}
        </p>

        <div className="flex items-center justify-between">
          {price && (
            <span className="text-[var(--text-primary)] font-bold text-lg">{price}</span>
          )}
          <button className="ml-auto bg-[var(--accent)] text-white font-bold text-sm px-5 py-2 rounded-lg hover:brightness-[0.92] transition-all">
            View
          </button>
        </div>
      </div>
    </Link>
  );
}
