interface TeamColorFallbackProps {
  teamName: string;
  liveryName: string;
  primaryColor: string;
  textColor: string;
}

export default function TeamColorFallback({
  teamName,
  liveryName,
  primaryColor,
  textColor,
}: TeamColorFallbackProps) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: primaryColor }}
    >
      <div
        className="text-center"
        style={{ color: textColor, textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}
      >
        <div className="font-semibold text-lg sm:text-xl mb-1.5 tracking-wide uppercase">
          {teamName}
        </div>
        <div className="font-medium text-base sm:text-lg tracking-wider uppercase opacity-80">
          {liveryName}
        </div>
      </div>
    </div>
  );
}
