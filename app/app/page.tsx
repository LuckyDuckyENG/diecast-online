'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ models: 0, manufacturers: 0, retailers: 0, addedThisWeek: 0 });
  const [drivers, setDrivers] = useState<any[]>([]);
  const [latestCars, setLatestCars] = useState<any[]>([]);
  const [revealed, setRevealed] = useState({ drivers: false, row1: false, row2: false, row3: false });
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Fetch stats for Live Catalogue box
  useEffect(() => {
    async function fetchStats() {
      const { count: modelCount } = await supabase.from('models').select('*', { count: 'exact', head: true });
      const { count: manufacturerCount } = await supabase.from('manufacturers').select('*', { count: 'exact', head: true });

      // Get cars added in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count: recentCount } = await supabase
        .from('cars')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString());

      setStats({
        models: modelCount || 0,
        manufacturers: manufacturerCount || 0,
        retailers: 12, // Hardcoded for now
        addedThisWeek: recentCount || 0,
      });
    }
    fetchStats();
  }, []);

  // Fetch top drivers with model counts
  useEffect(() => {
    async function fetchDrivers() {
      const { data: allDrivers } = await supabase
        .from('drivers')
        .select(`
          id,
          name,
          number,
          car_drivers(
            car:cars(
              id,
              team:teams(name, primary_color)
            )
          )
        `);

      if (!allDrivers) return;

      // Count models per driver and get their current team
      const driverCounts = allDrivers.map((driver: any) => {
        const cars = driver.car_drivers || [];
        const latestCar = cars[cars.length - 1]?.car;
        return {
          name: driver.name,
          team: latestCar?.team?.name || 'F1',
          color: latestCar?.team?.primary_color || '#cf2f2a',
          count: cars.length,
        };
      });

      // Sort by count and take top 10
      driverCounts.sort((a, b) => b.count - a.count);
      setDrivers(driverCounts.slice(0, 10));
    }
    fetchDrivers();
  }, []);

  // Fetch latest cars with models
  useEffect(() => {
    async function fetchLatestCars() {
      const { data: carsData } = await supabase
        .from('cars')
        .select(`
          id,
          event_name,
          livery_name,
          created_at,
          team:teams(name, primary_color),
          season:seasons(year),
          car_drivers(driver:drivers(name))
        `)
        .order('created_at', { ascending: false })
        .limit(12);

      if (!carsData) return;

      const carsWithModels = await Promise.all(
        carsData.map(async (car: any) => {
          const { data: models } = await supabase
            .from('models')
            .select('id, image_url, scale, manufacturer:manufacturers(name)')
            .eq('car_id', car.id);

          const driverName = car.car_drivers?.[0]?.driver?.name || '';
          const imageUrl = models?.find((m: any) => m.image_url)?.image_url;

          return {
            id: car.id,
            event: car.event_name || 'Grand Prix',
            year: car.season?.year || 2024,
            driver: driverName,
            team: car.team?.name || '',
            livery: car.livery_name || '',
            teamColor: car.team?.primary_color || '#cf2f2a',
            imageUrl,
            retailers: models?.length || 0,
            price: '$' + (Math.floor(Math.random() * 200) + 60), // Mock price for now
          };
        })
      );

      setLatestCars(carsWithModels);
    }
    fetchLatestCars();
  }, []);

  // Intersection Observer for scroll reveals
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-reveal');
            if (id) {
              setRevealed((prev) => ({ ...prev, [id]: true }));
              observerRef.current?.unobserve(entry.target);
            }
          }
        });
      },
      { threshold: 0.12 }
    );

    setTimeout(() => {
      document.querySelectorAll('[data-reveal]').forEach((el) => {
        observerRef.current?.observe(el);
      });
    }, 100);

    return () => observerRef.current?.disconnect();
  }, [latestCars]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const getRevealStyles = (key: keyof typeof revealed) => ({
    opacity: revealed[key] ? 1 : 0,
    transform: revealed[key] ? 'none' : 'translateY(28px)',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f6f5f1', fontFamily: "'Hanken Grotesk', sans-serif", color: '#1a1916' }}>
      {/* Red race line */}
      <div style={{ height: '3px', background: 'linear-gradient(90deg, #cf2f2a 0%, #cf2f2a 60%, transparent 60%, transparent 65%, #cf2f2a 65%, #cf2f2a 72%, transparent 72%, transparent 77%, #cf2f2a 77%, #cf2f2a 80%, transparent 80%)' }} />

      <Navbar />

      {/* Hero */}
      <header style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(to bottom, #f6f5f1, #f1efe9)' }}>
        <div style={{ position: 'absolute', right: '-60px', top: '-40px', width: '420px', height: '420px', background: 'repeating-linear-gradient(45deg, rgba(26,25,22,0.045) 0px, rgba(26,25,22,0.045) 22px, transparent 22px, transparent 44px)', transform: 'skewX(-12deg)' }} />
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '72px 32px 56px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: '64px', position: 'relative' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px', animation: 'fadeUp 0.7s ease both' }}>
              <span style={{ width: '28px', height: '2px', background: '#cf2f2a' }} />
              <span style={{ color: '#cf2f2a', fontFamily: "'Archivo', sans-serif", fontWeight: 700, fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>The Scale Model Catalogue</span>
            </div>
            <h1 style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: '62px', lineHeight: '1.02', letterSpacing: '-0.03em', margin: '0 0 18px', animation: 'fadeUp 0.7s ease 0.08s both' }}>
              Every F1 model<br />ever made.<br />
              <span style={{ fontStyle: 'italic', color: '#cf2f2a' }}>In one place.</span>
            </h1>
            <p style={{ color: '#8a857c', fontSize: '17px', margin: '0 0 30px', maxWidth: '480px', animation: 'fadeUp 0.7s ease 0.16s both' }}>
              Track prices across Spark, Minichamps, Looksmart, BBR and every maker collectors trust.
            </p>
            <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '58px', padding: '0 8px 0 16px', background: '#fff', border: '1.5px solid #e0ddd6', borderRadius: '14px', maxWidth: '560px', boxShadow: '0 8px 24px -12px rgba(26,25,22,0.18)', animation: 'fadeUp 0.7s ease 0.24s both' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a958c" strokeWidth="2.2" strokeLinecap="round" style={{ flex: 'none' }}>
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.5" y2="16.5" />
              </svg>
              <input
                type="text"
                placeholder="Search any car, driver, season or model..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '15px', fontFamily: "'Hanken Grotesk', sans-serif" }}
              />
              <button type="submit" style={{ background: '#cf2f2a', color: '#fff', fontWeight: 700, fontSize: '14px', height: '44px', padding: '0 22px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif" }}>
                Search
              </button>
            </form>
          </div>

          {/* Live Catalogue Tower */}
          <div style={{ background: '#1a1916', borderRadius: '16px', padding: '22px 22px 14px', color: '#fff', alignSelf: 'start', boxShadow: '0 24px 48px -24px rgba(26,25,22,0.5)', animation: 'fadeUp 0.7s ease 0.2s both' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 700, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Live catalogue</span>
              <span style={{ width: '7px', height: '7px', borderRadius: '99px', background: '#4ade80' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.65)' }}>Models tracked</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: '17px', color: '#ffffff' }}>{stats.models}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.65)' }}>Manufacturers</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: '17px', color: '#ffffff' }}>{stats.manufacturers}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.65)' }}>Retailers watched</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: '17px', color: '#ffffff' }}>{stats.retailers}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.65)' }}>Added this week</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: '17px', color: '#ffffff' }}>{stats.addedThisWeek}</span>
            </div>
            <div style={{ padding: '12px 0 4px', fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>Updated daily</div>
          </div>
        </div>
      </header>

      {/* Logo marquee */}
      <div style={{ background: '#fff', borderTop: '1px solid #ecebe6', borderBottom: '1px solid #ecebe6', padding: '18px 0', overflow: 'hidden' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', animation: 'marquee 40s linear infinite' }}>
            {[...Array(4)].map((_, setIndex) => (
              ['spark_logo.svg', 'minichamps_logo.png', 'Looksmart_Logo.png', 'BBR_Models_Logo.png', 'Amalgam_logo.png', 'Solido_Logo.png', 'Bburago_Logo.png'].map((logo, i) => (
                <img
                  key={`${setIndex}-${i}`}
                  src={`/logos/${logo}`}
                  alt=""
                  style={{ height: '26px', width: 'auto', objectFit: 'contain', opacity: 0.55, filter: 'grayscale(1)', margin: '0 36px', flex: 'none', display: 'inline-block' }}
                />
              ))
            ))}
          </div>
        </div>
      </div>

      {/* Browse by driver */}
      <section data-reveal="drivers" style={{ maxWidth: '1240px', margin: '0 auto', padding: '56px 32px 24px', ...getRevealStyles('drivers'), transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h2 style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: '28px', letterSpacing: '-0.02em', margin: 0 }}>Browse by driver</h2>
          <Link href="/browse" style={{ color: '#cf2f2a', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}>All drivers →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
          {drivers.map((driver, i) => (
            <Link
              key={i}
              href={`/browse?driver=${encodeURIComponent(driver.name)}`}
              style={{
                position: 'relative',
                display: 'block',
                background: `linear-gradient(105deg, color-mix(in oklab, ${driver.color} 24%, white) 0%, #ffffff 72%)`,
                border: '1px solid #e6e4de',
                borderRadius: '14px',
                padding: '18px 16px 16px',
                overflow: 'hidden',
                transition: 'transform 0.15s, box-shadow 0.15s',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 12px 24px -12px rgba(26,25,22,0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ display: 'block', fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: '15px', marginBottom: '3px', color: '#1a1916' }}>{driver.name}</span>
              <span style={{ display: 'block', fontSize: '12.5px', color: '#9a958c' }}>{driver.team} · {driver.count} models</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest models */}
      <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '40px 32px 72px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: '28px', letterSpacing: '-0.02em', margin: '0 0 6px' }}>Latest models</h2>
            <p style={{ color: '#9a958c', fontSize: '15px', margin: 0 }}>Recently added to the catalogue</p>
          </div>
          <Link href="/browse" style={{ color: '#cf2f2a', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}>View all →</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Row 1 */}
          <div data-reveal="row1" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px', ...getRevealStyles('row1'), transition: 'opacity 0.7s ease 0s, transform 0.7s ease 0s' }}>
            {latestCars.slice(0, 4).map((car) => (
              <Link
                key={car.id}
                href={`/cars/${car.id}`}
                style={{ display: 'block', background: '#fff', border: '1px solid #e6e4de', borderRadius: '16px', overflow: 'hidden', transition: 'transform 0.15s, box-shadow 0.15s', textDecoration: 'none' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 16px 32px -16px rgba(26,25,22,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ display: 'block', height: '4px', background: car.teamColor }} />
                <span style={{ height: '160px', background: '#efeee9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  {car.imageUrl ? (
                    <img src={car.imageUrl} alt={car.driver} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#9a958c', background: 'rgba(255,255,255,0.8)', padding: '4px 10px', borderRadius: '6px' }}>model photo</span>
                  )}
                </span>
                <span style={{ display: 'block', padding: '16px 18px 18px' }}>
                  <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cf2f2a', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{car.event} · {car.year}</span>
                  <span style={{ display: 'block', fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: '17px', marginBottom: '2px', color: '#1a1916' }}>{car.driver}</span>
                  <span style={{ display: 'block', fontSize: '13.5px', color: '#9a958c', marginBottom: '12px' }}>{car.team} · {car.livery}</span>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #ecebe6' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: '14px', color: '#1a1916' }}>from {car.price}</span>
                    <span style={{ fontSize: '12.5px', color: '#9a958c' }}>{car.retailers} retailers</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>

          {/* Row 2 */}
          <div data-reveal="row2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px', ...getRevealStyles('row2'), transition: 'opacity 0.7s ease 0.12s, transform 0.7s ease 0.12s' }}>
            {latestCars.slice(4, 8).map((car) => (
              <Link
                key={car.id}
                href={`/cars/${car.id}`}
                style={{ display: 'block', background: '#fff', border: '1px solid #e6e4de', borderRadius: '16px', overflow: 'hidden', transition: 'transform 0.15s, box-shadow 0.15s', textDecoration: 'none' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 16px 32px -16px rgba(26,25,22,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ display: 'block', height: '4px', background: car.teamColor }} />
                <span style={{ height: '160px', background: '#efeee9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  {car.imageUrl ? (
                    <img src={car.imageUrl} alt={car.driver} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#9a958c', background: 'rgba(255,255,255,0.8)', padding: '4px 10px', borderRadius: '6px' }}>model photo</span>
                  )}
                </span>
                <span style={{ display: 'block', padding: '16px 18px 18px' }}>
                  <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cf2f2a', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{car.event} · {car.year}</span>
                  <span style={{ display: 'block', fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: '17px', marginBottom: '2px', color: '#1a1916' }}>{car.driver}</span>
                  <span style={{ display: 'block', fontSize: '13.5px', color: '#9a958c', marginBottom: '12px' }}>{car.team} · {car.livery}</span>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #ecebe6' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: '14px', color: '#1a1916' }}>from {car.price}</span>
                    <span style={{ fontSize: '12.5px', color: '#9a958c' }}>{car.retailers} retailers</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>

          {/* Row 3 with fade-out CTA */}
          <div data-reveal="row3" style={{ position: 'relative', ...getRevealStyles('row3'), transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }}>
              {latestCars.slice(8, 12).map((car) => (
                <div key={car.id} style={{ background: '#fff', border: '1px solid #e6e4de', borderRadius: '16px', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '4px', background: car.teamColor }} />
                  <span style={{ height: '160px', background: 'repeating-linear-gradient(45deg, #f4f3ef 0px, #f4f3ef 10px, #efeee9 10px, #efeee9 20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {car.imageUrl ? (
                      <Image src={car.imageUrl} alt={car.driver} fill style={{ objectFit: 'contain', padding: '16px' }} />
                    ) : (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#9a958c', background: 'rgba(255,255,255,0.8)', padding: '4px 10px', borderRadius: '6px' }}>model photo</span>
                    )}
                  </span>
                  <span style={{ display: 'block', padding: '16px 18px 18px' }}>
                    <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cf2f2a', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{car.event} · {car.year}</span>
                    <span style={{ display: 'block', fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: '17px', color: '#1a1916' }}>{car.driver}</span>
                    <span style={{ display: 'block', fontSize: '13.5px', color: '#9a958c' }}>{car.team} · {car.livery}</span>
                  </span>
                </div>
              ))}
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(246,245,241,0) 0%, rgba(246,245,241,0.55) 40%, #f6f5f1 82%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <Link
                href="/browse"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#cf2f2a',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '16px',
                  padding: '16px 32px',
                  borderRadius: '12px',
                  boxShadow: '0 16px 32px -12px rgba(207,47,42,0.45)',
                  transition: 'transform 0.15s',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                }}
              >
                Explore all {stats.models} models →
              </Link>
              <span style={{ fontSize: '13px', color: '#9a958c' }}>From every team, season and manufacturer</span>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      <style jsx global>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
