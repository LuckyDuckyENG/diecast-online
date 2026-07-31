interface TeamColorFallbackProps {
  teamName: string;
  liveryName: string;
  primaryColor: string;
  textColor: string;
  eventName?: string;
}

export default function TeamColorFallback({
  teamName,
  liveryName,
  primaryColor,
  textColor,
  eventName,
}: TeamColorFallbackProps) {
  // Only show event if it's NOT "Grand Prix" (the default for season cars)
  const showEvent = eventName && eventName !== 'Grand Prix';

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: primaryColor }}
    >
      <div
        className="text-center"
        style={{ color: textColor, textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}
      >
        {showEvent && (
          <div className="font-bold text-xs sm:text-sm mb-2 tracking-widest uppercase opacity-90">
            {eventName}
          </div>
        )}
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
