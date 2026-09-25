'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The search field, with suggestions that cost no database queries.
 *
 * The whole vocabulary -- every driver, team, season and chassis code, 276
 * terms and under a kilobyte gzipped -- is fetched once from /api/search-terms
 * and filtered in the browser. Typing is free. See that route for why it is
 * not a query per keystroke.
 *
 * It suggests what you can SEARCH FOR, not individual models. For a catalogue
 * whose whole point is that people do not know what is in it, "MP4" showing
 * six chassis codes is more useful than three model rows would be.
 */

interface Term { t: string; k: 'driver' | 'team' | 'season' | 'chassis' | 'event'; n: number }

const LABEL: Record<Term['k'], string> = {
  driver: 'driver',
  team: 'team',
  season: 'season',
  chassis: 'car',
  event: 'race',
};

export default function SearchBox({ className = '' }: { className?: string }) {
  const [query, setQuery] = useState('');
  const [terms, setTerms] = useState<Term[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /**
   * Loaded once, lazily, on first focus rather than on mount. Most visits
   * never touch the search box, and a page that loads this on every render
   * pays for a list nobody opened.
   */
  const loaded = useRef(false);
  const load = () => {
    if (loaded.current) return;
    loaded.current = true;
    fetch('/api/search-terms')
      .then(r => r.json())
      .then(d => setTerms(d.terms || []))
      .catch(() => { /* suggestions are a convenience; the form still works */ });
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    /**
     * A term that STARTS with what was typed comes first. Someone typing "sai"
     * means Sainz, not "Carlos Sainz" buried under every car whose name
     * contains those letters somewhere.
     */
    const starts: Term[] = [], contains: Term[] = [];
    for (const t of terms) {
      const s = t.t.toLowerCase();
      if (s.startsWith(q)) starts.push(t);
      else if (s.includes(q)) contains.push(t);
      // A surname match counts as a start: "verstappen" should find
      // "Max Verstappen" as readily as "max" does.
      else if (s.split(' ').some(w => w.startsWith(q))) starts.push(t);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [query, terms]);

  useEffect(() => { setActive(-1); }, [query]);

  // Click anywhere else and the list goes away.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const go = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? matches.length : i) - 1); }
    else if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'Enter' && active >= 0) {
      // Only hijack Enter when something is highlighted. Otherwise the form
      // submits what was actually typed, which may not be in the list at all.
      e.preventDefault();
      go(matches[active].t);
    }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <form onSubmit={e => { e.preventDefault(); go(query); }} role="search">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => { load(); setOpen(true); }}
            onKeyDown={onKeyDown}
            placeholder="Search drivers, teams, events, or SKUs..."
            aria-label="Search models"
            aria-autocomplete="list"
            aria-expanded={open && matches.length > 0}
            aria-controls="search-suggestions"
            className="w-full px-4 py-2 pl-10 rounded-lg border bg-white/50 text-sm focus:outline-none transition-all"
            style={{ borderColor: '#e0ddd6', color: '#1a1916', fontFamily: "'Hanken Grotesk', sans-serif" }}
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            fill="none"
            stroke="#8a857c"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </form>

      {open && matches.length > 0 && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl border border-[var(--border-light)] shadow-lg overflow-hidden"
        >
          {matches.map((m, i) => (
            <li key={`${m.k}-${m.t}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(m.t)}
                className={`w-full text-left px-4 py-2 flex items-baseline justify-between gap-3 ${
                  i === active ? 'bg-[var(--bg-secondary)]' : ''
                }`}
              >
                <span className="text-[15px] text-[var(--text-primary)] truncate">{m.t}</span>
                <span className="text-xs text-[var(--text-tertiary)] shrink-0">
                  {LABEL[m.k]} · {m.n} {m.n === 1 ? 'car' : 'cars'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
