'use client';

import { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

interface DiecastModel {
  id: string;
  name: string; // e.g., "Spark 1:43 - Bahrain GP - Hamilton"
  manufacturer: string;
  scale: string;
  driver: string;
  eventName: string; // e.g., "Bahrain GP 2024"
  sku?: string;
  ebayLinked?: boolean;
  ebayUrl?: string;
  ebayPrice?: string;
  lastUpdated?: string;
}

interface F1Car {
  id: string;
  year: number;
  team: string;
  chassis: string; // e.g., "W15", "RB20", "SF-24"
  drivers: string[]; // e.g., ["Lewis Hamilton", "George Russell"]
  models: DiecastModel[]; // The actual diecast models for this car
}

interface EbaySearchResult {
  title: string;
  price: string;
  url: string;
  image: string;
}

export default function EbayLinkingAdmin() {
  const [f1Cars, setF1Cars] = useState<F1Car[]>([]);
  const [searchResults, setSearchResults] = useState<EbaySearchResult[]>([]);
  const [selectedModel, setSelectedModel] = useState<DiecastModel | null>(null);
  const [expandedCars, setExpandedCars] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Generate years from 1995 to 2025
  const years = Array.from({ length: 31 }, (_, i) => 2025 - i); // 2025 down to 1995

  // Load F1 cars from your data source
  useEffect(() => {
    // TODO: Replace with actual Supabase query
    // For now, using mock data with parent (F1 Car) and children (Diecast Models)
    const mockF1Cars: F1Car[] = [
      // === 2025 SEASON ===
      {
        id: '2025-mercedes',
        year: 2025,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W16',
        drivers: ['Andrea Kimi Antonelli', 'George Russell'],
        models: [], // Empty - to be filled later
      },
      {
        id: '2025-redbull',
        year: 2025,
        team: 'Red Bull Racing',
        chassis: 'RB21',
        drivers: ['Max Verstappen', 'Liam Lawson'],
        models: [],
      },
      {
        id: '2025-ferrari',
        year: 2025,
        team: 'Ferrari',
        chassis: 'SF-25',
        drivers: ['Charles Leclerc', 'Lewis Hamilton'],
        models: [],
      },
      {
        id: '2025-mclaren',
        year: 2025,
        team: 'McLaren',
        chassis: 'MCL39',
        drivers: ['Lando Norris', 'Oscar Piastri'],
        models: [],
      },
      {
        id: '2025-astonmartin',
        year: 2025,
        team: 'Aston Martin',
        chassis: 'AMR25',
        drivers: ['Fernando Alonso', 'Lance Stroll'],
        models: [],
      },
      {
        id: '2025-alpine',
        year: 2025,
        team: 'Alpine',
        chassis: 'A525',
        drivers: ['Pierre Gasly', 'Jack Doohan'],
        models: [],
      },
      {
        id: '2025-haas',
        year: 2025,
        team: 'Haas',
        chassis: 'VF-25',
        drivers: ['Esteban Ocon', 'Oliver Bearman'],
        models: [],
      },
      {
        id: '2025-rb',
        year: 2025,
        team: 'RB',
        chassis: 'VCARB 02',
        drivers: ['Yuki Tsunoda', 'Isack Hadjar'],
        models: [],
      },
      {
        id: '2025-sauber',
        year: 2025,
        team: 'Sauber',
        chassis: 'C45',
        drivers: ['Nico Hulkenberg', 'Gabriel Bortoleto'],
        models: [],
      },
      {
        id: '2025-williams',
        year: 2025,
        team: 'Williams',
        chassis: 'FW47',
        drivers: ['Carlos Sainz', 'Alex Albon'],
        models: [],
      },

      // === 2024 SEASON ===
      {
        id: '2024-mercedes',
        year: 2024,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W15',
        drivers: ['Lewis Hamilton', 'George Russell'],
        models: [
          {
            id: 'model-w15-ham-bahrain',
            name: 'Mercedes W15 - Bahrain GP 2024 - Hamilton',
            manufacturer: 'Spark',
            scale: '1:43',
            driver: 'Lewis Hamilton',
            eventName: 'Bahrain GP 2024',
            sku: 'S8076',
            ebayLinked: false,
          },
          {
            id: 'model-w15-rus-bahrain',
            name: 'Mercedes W15 - Bahrain GP 2024 - Russell',
            manufacturer: 'Spark',
            scale: '1:43',
            driver: 'George Russell',
            eventName: 'Bahrain GP 2024',
            sku: 'S8077',
            ebayLinked: false,
          },
          {
            id: 'model-w15-ham-saudi',
            name: 'Mercedes W15 - Saudi Arabian GP 2024 - Hamilton',
            manufacturer: 'Spark',
            scale: '1:43',
            driver: 'Lewis Hamilton',
            eventName: 'Saudi Arabian GP 2024',
            sku: 'S8078',
            ebayLinked: false,
          },
        ],
      },
      {
        id: '2024-redbull',
        year: 2024,
        team: 'Red Bull Racing',
        chassis: 'RB20',
        drivers: ['Max Verstappen', 'Sergio Perez'],
        models: [],
      },
      {
        id: '2024-ferrari',
        year: 2024,
        team: 'Ferrari',
        chassis: 'SF-24',
        drivers: ['Charles Leclerc', 'Carlos Sainz'],
        models: [],
      },
      {
        id: '2024-mclaren',
        year: 2024,
        team: 'McLaren',
        chassis: 'MCL38',
        drivers: ['Lando Norris', 'Oscar Piastri'],
        models: [],
      },
      {
        id: '2024-astonmartin',
        year: 2024,
        team: 'Aston Martin',
        chassis: 'AMR24',
        drivers: ['Fernando Alonso', 'Lance Stroll'],
        models: [],
      },
      {
        id: '2024-alpine',
        year: 2024,
        team: 'Alpine',
        chassis: 'A524',
        drivers: ['Pierre Gasly', 'Esteban Ocon'],
        models: [],
      },
      {
        id: '2024-haas',
        year: 2024,
        team: 'Haas',
        chassis: 'VF-24',
        drivers: ['Kevin Magnussen', 'Nico Hulkenberg'],
        models: [],
      },
      {
        id: '2024-rb',
        year: 2024,
        team: 'RB',
        chassis: 'VCARB 01',
        drivers: ['Yuki Tsunoda', 'Daniel Ricciardo'],
        models: [],
      },
      {
        id: '2024-sauber',
        year: 2024,
        team: 'Sauber',
        chassis: 'C44',
        drivers: ['Valtteri Bottas', 'Zhou Guanyu'],
        models: [],
      },
      {
        id: '2024-williams',
        year: 2024,
        team: 'Williams',
        chassis: 'FW46',
        drivers: ['Alex Albon', 'Logan Sargeant'],
        models: [],
      },

      // === 2023 SEASON ===
      {
        id: '2023-mercedes',
        year: 2023,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W14',
        drivers: ['Lewis Hamilton', 'George Russell'],
        models: [],
      },
      {
        id: '2023-redbull',
        year: 2023,
        team: 'Red Bull Racing',
        chassis: 'RB19',
        drivers: ['Max Verstappen', 'Sergio Perez'],
        models: [],
      },
      {
        id: '2023-ferrari',
        year: 2023,
        team: 'Ferrari',
        chassis: 'SF-23',
        drivers: ['Charles Leclerc', 'Carlos Sainz'],
        models: [],
      },
      {
        id: '2023-mclaren',
        year: 2023,
        team: 'McLaren',
        chassis: 'MCL60',
        drivers: ['Lando Norris', 'Oscar Piastri'],
        models: [],
      },
      {
        id: '2023-astonmartin',
        year: 2023,
        team: 'Aston Martin',
        chassis: 'AMR23',
        drivers: ['Fernando Alonso', 'Lance Stroll'],
        models: [],
      },
      {
        id: '2023-alpine',
        year: 2023,
        team: 'Alpine',
        chassis: 'A523',
        drivers: ['Pierre Gasly', 'Esteban Ocon'],
        models: [],
      },
      {
        id: '2023-haas',
        year: 2023,
        team: 'Haas',
        chassis: 'VF-23',
        drivers: ['Kevin Magnussen', 'Nico Hulkenberg'],
        models: [],
      },
      {
        id: '2023-alphatauri',
        year: 2023,
        team: 'AlphaTauri',
        chassis: 'AT04',
        drivers: ['Yuki Tsunoda', 'Nyck de Vries'],
        models: [],
      },
      {
        id: '2023-alfaromeo',
        year: 2023,
        team: 'Alfa Romeo',
        chassis: 'C43',
        drivers: ['Valtteri Bottas', 'Zhou Guanyu'],
        models: [],
      },
      {
        id: '2023-williams',
        year: 2023,
        team: 'Williams',
        chassis: 'FW45',
        drivers: ['Alex Albon', 'Logan Sargeant'],
        models: [],
      },

      // === 2022 SEASON ===
      {
        id: '2022-mercedes',
        year: 2022,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W13',
        drivers: ['Lewis Hamilton', 'George Russell'],
        models: [],
      },
      {
        id: '2022-redbull',
        year: 2022,
        team: 'Red Bull Racing',
        chassis: 'RB18',
        drivers: ['Max Verstappen', 'Sergio Perez'],
        models: [],
      },
      {
        id: '2022-ferrari',
        year: 2022,
        team: 'Ferrari',
        chassis: 'F1-75',
        drivers: ['Charles Leclerc', 'Carlos Sainz'],
        models: [],
      },
      {
        id: '2022-mclaren',
        year: 2022,
        team: 'McLaren',
        chassis: 'MCL36',
        drivers: ['Lando Norris', 'Daniel Ricciardo'],
        models: [],
      },
      {
        id: '2022-astonmartin',
        year: 2022,
        team: 'Aston Martin',
        chassis: 'AMR22',
        drivers: ['Sebastian Vettel', 'Lance Stroll'],
        models: [],
      },
      {
        id: '2022-alpine',
        year: 2022,
        team: 'Alpine',
        chassis: 'A522',
        drivers: ['Fernando Alonso', 'Esteban Ocon'],
        models: [],
      },
      {
        id: '2022-haas',
        year: 2022,
        team: 'Haas',
        chassis: 'VF-22',
        drivers: ['Kevin Magnussen', 'Mick Schumacher'],
        models: [],
      },
      {
        id: '2022-alphatauri',
        year: 2022,
        team: 'AlphaTauri',
        chassis: 'AT03',
        drivers: ['Pierre Gasly', 'Yuki Tsunoda'],
        models: [],
      },
      {
        id: '2022-alfaromeo',
        year: 2022,
        team: 'Alfa Romeo',
        chassis: 'C42',
        drivers: ['Valtteri Bottas', 'Zhou Guanyu'],
        models: [],
      },
      {
        id: '2022-williams',
        year: 2022,
        team: 'Williams',
        chassis: 'FW44',
        drivers: ['Alex Albon', 'Nicholas Latifi'],
        models: [],
      },

      // === 2021 SEASON ===
      {
        id: '2021-mercedes',
        year: 2021,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W12',
        drivers: ['Lewis Hamilton', 'Valtteri Bottas'],
        models: [],
      },
      {
        id: '2021-redbull',
        year: 2021,
        team: 'Red Bull Racing',
        chassis: 'RB16B',
        drivers: ['Max Verstappen', 'Sergio Perez'],
        models: [],
      },
      {
        id: '2021-ferrari',
        year: 2021,
        team: 'Ferrari',
        chassis: 'SF21',
        drivers: ['Charles Leclerc', 'Carlos Sainz'],
        models: [],
      },
      {
        id: '2021-mclaren',
        year: 2021,
        team: 'McLaren',
        chassis: 'MCL35M',
        drivers: ['Lando Norris', 'Daniel Ricciardo'],
        models: [],
      },
      {
        id: '2021-astonmartin',
        year: 2021,
        team: 'Aston Martin',
        chassis: 'AMR21',
        drivers: ['Sebastian Vettel', 'Lance Stroll'],
        models: [],
      },
      {
        id: '2021-alpine',
        year: 2021,
        team: 'Alpine',
        chassis: 'A521',
        drivers: ['Fernando Alonso', 'Esteban Ocon'],
        models: [],
      },
      {
        id: '2021-alphatauri',
        year: 2021,
        team: 'AlphaTauri',
        chassis: 'AT02',
        drivers: ['Pierre Gasly', 'Yuki Tsunoda'],
        models: [],
      },
      {
        id: '2021-alfaromeo',
        year: 2021,
        team: 'Alfa Romeo',
        chassis: 'C41',
        drivers: ['Kimi Raikkonen', 'Antonio Giovinazzi'],
        models: [],
      },
      {
        id: '2021-haas',
        year: 2021,
        team: 'Haas',
        chassis: 'VF-21',
        drivers: ['Mick Schumacher', 'Nikita Mazepin'],
        models: [],
      },
      {
        id: '2021-williams',
        year: 2021,
        team: 'Williams',
        chassis: 'FW43B',
        drivers: ['George Russell', 'Nicholas Latifi'],
        models: [],
      },

      // === 2020 SEASON ===
      {
        id: '2020-mercedes',
        year: 2020,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W11',
        drivers: ['Lewis Hamilton', 'Valtteri Bottas'],
        models: [],
      },
      {
        id: '2020-redbull',
        year: 2020,
        team: 'Red Bull Racing',
        chassis: 'RB16',
        drivers: ['Max Verstappen', 'Alexander Albon'],
        models: [],
      },
      {
        id: '2020-ferrari',
        year: 2020,
        team: 'Ferrari',
        chassis: 'SF1000',
        drivers: ['Sebastian Vettel', 'Charles Leclerc'],
        models: [],
      },
      {
        id: '2020-mclaren',
        year: 2020,
        team: 'McLaren',
        chassis: 'MCL35',
        drivers: ['Carlos Sainz', 'Lando Norris'],
        models: [],
      },
      {
        id: '2020-renault',
        year: 2020,
        team: 'Renault',
        chassis: 'R.S.20',
        drivers: ['Daniel Ricciardo', 'Esteban Ocon'],
        models: [],
      },
      {
        id: '2020-racingpoint',
        year: 2020,
        team: 'Racing Point',
        chassis: 'RP20',
        drivers: ['Sergio Perez', 'Lance Stroll'],
        models: [],
      },
      {
        id: '2020-alphatauri',
        year: 2020,
        team: 'AlphaTauri',
        chassis: 'AT01',
        drivers: ['Pierre Gasly', 'Daniil Kvyat'],
        models: [],
      },
      {
        id: '2020-alfaromeo',
        year: 2020,
        team: 'Alfa Romeo',
        chassis: 'C39',
        drivers: ['Kimi Raikkonen', 'Antonio Giovinazzi'],
        models: [],
      },
      {
        id: '2020-haas',
        year: 2020,
        team: 'Haas',
        chassis: 'VF-20',
        drivers: ['Romain Grosjean', 'Kevin Magnussen'],
        models: [],
      },
      {
        id: '2020-williams',
        year: 2020,
        team: 'Williams',
        chassis: 'FW43',
        drivers: ['George Russell', 'Nicholas Latifi'],
        models: [],
      },

      // === 2019 SEASON ===
      {
        id: '2019-mercedes',
        year: 2019,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W10',
        drivers: ['Lewis Hamilton', 'Valtteri Bottas'],
        models: [],
      },
      {
        id: '2019-ferrari',
        year: 2019,
        team: 'Ferrari',
        chassis: 'SF90',
        drivers: ['Sebastian Vettel', 'Charles Leclerc'],
        models: [],
      },
      {
        id: '2019-redbull',
        year: 2019,
        team: 'Red Bull Racing',
        chassis: 'RB15',
        drivers: ['Max Verstappen', 'Pierre Gasly', 'Alexander Albon'],
        models: [],
      },
      {
        id: '2019-mclaren',
        year: 2019,
        team: 'McLaren',
        chassis: 'MCL34',
        drivers: ['Carlos Sainz', 'Lando Norris'],
        models: [],
      },
      {
        id: '2019-renault',
        year: 2019,
        team: 'Renault',
        chassis: 'R.S.19',
        drivers: ['Daniel Ricciardo', 'Nico Hulkenberg'],
        models: [],
      },
      {
        id: '2019-tororosso',
        year: 2019,
        team: 'Toro Rosso',
        chassis: 'STR14',
        drivers: ['Daniil Kvyat', 'Alexander Albon', 'Pierre Gasly'],
        models: [],
      },
      {
        id: '2019-racingpoint',
        year: 2019,
        team: 'Racing Point',
        chassis: 'RP19',
        drivers: ['Sergio Perez', 'Lance Stroll'],
        models: [],
      },
      {
        id: '2019-alfaromeo',
        year: 2019,
        team: 'Alfa Romeo',
        chassis: 'C38',
        drivers: ['Kimi Raikkonen', 'Antonio Giovinazzi'],
        models: [],
      },
      {
        id: '2019-haas',
        year: 2019,
        team: 'Haas',
        chassis: 'VF-19',
        drivers: ['Romain Grosjean', 'Kevin Magnussen'],
        models: [],
      },
      {
        id: '2019-williams',
        year: 2019,
        team: 'Williams',
        chassis: 'FW42',
        drivers: ['George Russell', 'Robert Kubica'],
        models: [],
      },

      // === 2018 SEASON ===
      {
        id: '2018-mercedes',
        year: 2018,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W09',
        drivers: ['Lewis Hamilton', 'Valtteri Bottas'],
        models: [],
      },
      {
        id: '2018-ferrari',
        year: 2018,
        team: 'Ferrari',
        chassis: 'SF71H',
        drivers: ['Sebastian Vettel', 'Kimi Raikkonen'],
        models: [],
      },
      {
        id: '2018-redbull',
        year: 2018,
        team: 'Red Bull Racing',
        chassis: 'RB14',
        drivers: ['Daniel Ricciardo', 'Max Verstappen'],
        models: [],
      },
      {
        id: '2018-renault',
        year: 2018,
        team: 'Renault',
        chassis: 'R.S.18',
        drivers: ['Nico Hulkenberg', 'Carlos Sainz'],
        models: [],
      },
      {
        id: '2018-haas',
        year: 2018,
        team: 'Haas',
        chassis: 'VF-18',
        drivers: ['Romain Grosjean', 'Kevin Magnussen'],
        models: [],
      },
      {
        id: '2018-mclaren',
        year: 2018,
        team: 'McLaren',
        chassis: 'MCL33',
        drivers: ['Fernando Alonso', 'Stoffel Vandoorne'],
        models: [],
      },
      {
        id: '2018-forceindia',
        year: 2018,
        team: 'Force India',
        chassis: 'VJM11',
        drivers: ['Esteban Ocon', 'Sergio Perez'],
        models: [],
      },
      {
        id: '2018-sauber',
        year: 2018,
        team: 'Sauber',
        chassis: 'C37',
        drivers: ['Marcus Ericsson', 'Charles Leclerc'],
        models: [],
      },
      {
        id: '2018-tororosso',
        year: 2018,
        team: 'Toro Rosso',
        chassis: 'STR13',
        drivers: ['Brendon Hartley', 'Pierre Gasly'],
        models: [],
      },
      {
        id: '2018-williams',
        year: 2018,
        team: 'Williams',
        chassis: 'FW41',
        drivers: ['Lance Stroll', 'Sergey Sirotkin'],
        models: [],
      },

      // === 2017 SEASON ===
      {
        id: '2017-mercedes',
        year: 2017,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W08',
        drivers: ['Lewis Hamilton', 'Valtteri Bottas'],
        models: [],
      },
      {
        id: '2017-ferrari',
        year: 2017,
        team: 'Ferrari',
        chassis: 'SF70H',
        drivers: ['Sebastian Vettel', 'Kimi Raikkonen'],
        models: [],
      },
      {
        id: '2017-redbull',
        year: 2017,
        team: 'Red Bull Racing',
        chassis: 'RB13',
        drivers: ['Daniel Ricciardo', 'Max Verstappen'],
        models: [],
      },
      {
        id: '2017-forceindia',
        year: 2017,
        team: 'Force India',
        chassis: 'VJM10',
        drivers: ['Sergio Perez', 'Esteban Ocon'],
        models: [],
      },
      {
        id: '2017-williams',
        year: 2017,
        team: 'Williams',
        chassis: 'FW40',
        drivers: ['Felipe Massa', 'Lance Stroll'],
        models: [],
      },
      {
        id: '2017-mclaren',
        year: 2017,
        team: 'McLaren',
        chassis: 'MCL32',
        drivers: ['Fernando Alonso', 'Stoffel Vandoorne'],
        models: [],
      },
      {
        id: '2017-tororosso',
        year: 2017,
        team: 'Toro Rosso',
        chassis: 'STR12',
        drivers: ['Carlos Sainz', 'Daniil Kvyat', 'Pierre Gasly'],
        models: [],
      },
      {
        id: '2017-haas',
        year: 2017,
        team: 'Haas',
        chassis: 'VF-17',
        drivers: ['Romain Grosjean', 'Kevin Magnussen'],
        models: [],
      },
      {
        id: '2017-renault',
        year: 2017,
        team: 'Renault',
        chassis: 'R.S.17',
        drivers: ['Nico Hulkenberg', 'Jolyon Palmer', 'Carlos Sainz'],
        models: [],
      },
      {
        id: '2017-sauber',
        year: 2017,
        team: 'Sauber',
        chassis: 'C36',
        drivers: ['Marcus Ericsson', 'Pascal Wehrlein'],
        models: [],
      },

      // === 2016 SEASON ===
      {
        id: '2016-mercedes',
        year: 2016,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W07',
        drivers: ['Lewis Hamilton', 'Nico Rosberg'],
        models: [],
      },
      {
        id: '2016-ferrari',
        year: 2016,
        team: 'Ferrari',
        chassis: 'SF16-H',
        drivers: ['Sebastian Vettel', 'Kimi Raikkonen'],
        models: [],
      },
      {
        id: '2016-redbull',
        year: 2016,
        team: 'Red Bull Racing',
        chassis: 'RB12',
        drivers: ['Daniel Ricciardo', 'Max Verstappen', 'Daniil Kvyat'],
        models: [],
      },
      {
        id: '2016-williams',
        year: 2016,
        team: 'Williams',
        chassis: 'FW38',
        drivers: ['Valtteri Bottas', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2016-forceindia',
        year: 2016,
        team: 'Force India',
        chassis: 'VJM09',
        drivers: ['Sergio Perez', 'Nico Hulkenberg'],
        models: [],
      },
      {
        id: '2016-mclaren',
        year: 2016,
        team: 'McLaren',
        chassis: 'MP4-31',
        drivers: ['Fernando Alonso', 'Jenson Button'],
        models: [],
      },
      {
        id: '2016-tororosso',
        year: 2016,
        team: 'Toro Rosso',
        chassis: 'STR11',
        drivers: ['Carlos Sainz', 'Max Verstappen', 'Daniil Kvyat'],
        models: [],
      },
      {
        id: '2016-haas',
        year: 2016,
        team: 'Haas',
        chassis: 'VF-16',
        drivers: ['Romain Grosjean', 'Esteban Gutierrez'],
        models: [],
      },
      {
        id: '2016-renault',
        year: 2016,
        team: 'Renault',
        chassis: 'R.S.16',
        drivers: ['Kevin Magnussen', 'Jolyon Palmer'],
        models: [],
      },
      {
        id: '2016-sauber',
        year: 2016,
        team: 'Sauber',
        chassis: 'C35',
        drivers: ['Felipe Nasr', 'Marcus Ericsson'],
        models: [],
      },
      {
        id: '2016-manor',
        year: 2016,
        team: 'Manor',
        chassis: 'MRT05',
        drivers: ['Pascal Wehrlein', 'Rio Haryanto', 'Esteban Ocon'],
        models: [],
      },

      // === 2015 SEASON ===
      {
        id: '2015-mercedes',
        year: 2015,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W06',
        drivers: ['Lewis Hamilton', 'Nico Rosberg'],
        models: [],
      },
      {
        id: '2015-ferrari',
        year: 2015,
        team: 'Ferrari',
        chassis: 'SF15-T',
        drivers: ['Sebastian Vettel', 'Kimi Raikkonen'],
        models: [],
      },
      {
        id: '2015-williams',
        year: 2015,
        team: 'Williams',
        chassis: 'FW37',
        drivers: ['Valtteri Bottas', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2015-redbull',
        year: 2015,
        team: 'Red Bull Racing',
        chassis: 'RB11',
        drivers: ['Daniel Ricciardo', 'Daniil Kvyat'],
        models: [],
      },
      {
        id: '2015-forceindia',
        year: 2015,
        team: 'Force India',
        chassis: 'VJM08',
        drivers: ['Sergio Perez', 'Nico Hulkenberg'],
        models: [],
      },
      {
        id: '2015-lotus',
        year: 2015,
        team: 'Lotus',
        chassis: 'E23',
        drivers: ['Romain Grosjean', 'Pastor Maldonado'],
        models: [],
      },
      {
        id: '2015-tororosso',
        year: 2015,
        team: 'Toro Rosso',
        chassis: 'STR10',
        drivers: ['Max Verstappen', 'Carlos Sainz'],
        models: [],
      },
      {
        id: '2015-sauber',
        year: 2015,
        team: 'Sauber',
        chassis: 'C34',
        drivers: ['Marcus Ericsson', 'Felipe Nasr'],
        models: [],
      },
      {
        id: '2015-mclaren',
        year: 2015,
        team: 'McLaren',
        chassis: 'MP4-30',
        drivers: ['Fernando Alonso', 'Jenson Button'],
        models: [],
      },
      {
        id: '2015-manor',
        year: 2015,
        team: 'Manor',
        chassis: 'MR03B',
        drivers: ['Will Stevens', 'Roberto Merhi'],
        models: [],
      },

      // === 2014 SEASON ===
      {
        id: '2014-mercedes',
        year: 2014,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W05',
        drivers: ['Lewis Hamilton', 'Nico Rosberg'],
        models: [],
      },
      {
        id: '2014-redbull',
        year: 2014,
        team: 'Red Bull Racing',
        chassis: 'RB10',
        drivers: ['Sebastian Vettel', 'Daniel Ricciardo'],
        models: [],
      },
      {
        id: '2014-ferrari',
        year: 2014,
        team: 'Ferrari',
        chassis: 'F14 T',
        drivers: ['Fernando Alonso', 'Kimi Raikkonen'],
        models: [],
      },
      {
        id: '2014-williams',
        year: 2014,
        team: 'Williams',
        chassis: 'FW36',
        drivers: ['Valtteri Bottas', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2014-mclaren',
        year: 2014,
        team: 'McLaren',
        chassis: 'MP4-29',
        drivers: ['Jenson Button', 'Kevin Magnussen'],
        models: [],
      },
      {
        id: '2014-forceindia',
        year: 2014,
        team: 'Force India',
        chassis: 'VJM07',
        drivers: ['Sergio Perez', 'Nico Hulkenberg'],
        models: [],
      },
      {
        id: '2014-tororosso',
        year: 2014,
        team: 'Toro Rosso',
        chassis: 'STR9',
        drivers: ['Jean-Eric Vergne', 'Daniil Kvyat'],
        models: [],
      },
      {
        id: '2014-lotus',
        year: 2014,
        team: 'Lotus',
        chassis: 'E22',
        drivers: ['Romain Grosjean', 'Pastor Maldonado'],
        models: [],
      },
      {
        id: '2014-sauber',
        year: 2014,
        team: 'Sauber',
        chassis: 'C33',
        drivers: ['Adrian Sutil', 'Esteban Gutierrez'],
        models: [],
      },
      {
        id: '2014-marussia',
        year: 2014,
        team: 'Marussia',
        chassis: 'MR03',
        drivers: ['Jules Bianchi', 'Max Chilton'],
        models: [],
      },
      {
        id: '2014-caterham',
        year: 2014,
        team: 'Caterham',
        chassis: 'CT05',
        drivers: ['Marcus Ericsson', 'Kamui Kobayashi'],
        models: [],
      },

      // === 2013 SEASON ===
      {
        id: '2013-redbull',
        year: 2013,
        team: 'Red Bull Racing',
        chassis: 'RB9',
        drivers: ['Sebastian Vettel', 'Mark Webber'],
        models: [],
      },
      {
        id: '2013-ferrari',
        year: 2013,
        team: 'Ferrari',
        chassis: 'F138',
        drivers: ['Fernando Alonso', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2013-mercedes',
        year: 2013,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W04',
        drivers: ['Lewis Hamilton', 'Nico Rosberg'],
        models: [],
      },
      {
        id: '2013-lotus',
        year: 2013,
        team: 'Lotus',
        chassis: 'E21',
        drivers: ['Kimi Raikkonen', 'Romain Grosjean'],
        models: [],
      },
      {
        id: '2013-mclaren',
        year: 2013,
        team: 'McLaren',
        chassis: 'MP4-28',
        drivers: ['Jenson Button', 'Sergio Perez'],
        models: [],
      },
      {
        id: '2013-forceindia',
        year: 2013,
        team: 'Force India',
        chassis: 'VJM06',
        drivers: ['Paul di Resta', 'Adrian Sutil'],
        models: [],
      },
      {
        id: '2013-sauber',
        year: 2013,
        team: 'Sauber',
        chassis: 'C32',
        drivers: ['Nico Hulkenberg', 'Esteban Gutierrez'],
        models: [],
      },
      {
        id: '2013-tororosso',
        year: 2013,
        team: 'Toro Rosso',
        chassis: 'STR8',
        drivers: ['Daniel Ricciardo', 'Jean-Eric Vergne'],
        models: [],
      },
      {
        id: '2013-williams',
        year: 2013,
        team: 'Williams',
        chassis: 'FW35',
        drivers: ['Pastor Maldonado', 'Valtteri Bottas'],
        models: [],
      },
      {
        id: '2013-marussia',
        year: 2013,
        team: 'Marussia',
        chassis: 'MR02',
        drivers: ['Jules Bianchi', 'Max Chilton'],
        models: [],
      },
      {
        id: '2013-caterham',
        year: 2013,
        team: 'Caterham',
        chassis: 'CT03',
        drivers: ['Charles Pic', 'Giedo van der Garde'],
        models: [],
      },

      // === 2012 SEASON ===
      {
        id: '2012-redbull',
        year: 2012,
        team: 'Red Bull Racing',
        chassis: 'RB8',
        drivers: ['Sebastian Vettel', 'Mark Webber'],
        models: [],
      },
      {
        id: '2012-mclaren',
        year: 2012,
        team: 'McLaren',
        chassis: 'MP4-27',
        drivers: ['Lewis Hamilton', 'Jenson Button'],
        models: [],
      },
      {
        id: '2012-ferrari',
        year: 2012,
        team: 'Ferrari',
        chassis: 'F2012',
        drivers: ['Fernando Alonso', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2012-lotus',
        year: 2012,
        team: 'Lotus',
        chassis: 'E20',
        drivers: ['Kimi Raikkonen', 'Romain Grosjean'],
        models: [],
      },
      {
        id: '2012-mercedes',
        year: 2012,
        team: 'Mercedes',
        chassis: 'W03',
        drivers: ['Michael Schumacher', 'Nico Rosberg'],
        models: [],
      },
      {
        id: '2012-sauber',
        year: 2012,
        team: 'Sauber',
        chassis: 'C31',
        drivers: ['Sergio Perez', 'Kamui Kobayashi'],
        models: [],
      },
      {
        id: '2012-forceindia',
        year: 2012,
        team: 'Force India',
        chassis: 'VJM05',
        drivers: ['Paul di Resta', 'Nico Hulkenberg'],
        models: [],
      },
      {
        id: '2012-williams',
        year: 2012,
        team: 'Williams',
        chassis: 'FW34',
        drivers: ['Pastor Maldonado', 'Bruno Senna'],
        models: [],
      },
      {
        id: '2012-tororosso',
        year: 2012,
        team: 'Toro Rosso',
        chassis: 'STR7',
        drivers: ['Daniel Ricciardo', 'Jean-Eric Vergne'],
        models: [],
      },
      {
        id: '2012-caterham',
        year: 2012,
        team: 'Caterham',
        chassis: 'CT01',
        drivers: ['Heikki Kovalainen', 'Vitaly Petrov'],
        models: [],
      },
      {
        id: '2012-marussia',
        year: 2012,
        team: 'Marussia',
        chassis: 'MR01',
        drivers: ['Timo Glock', 'Charles Pic'],
        models: [],
      },
      {
        id: '2012-hrt',
        year: 2012,
        team: 'HRT',
        chassis: 'F112',
        drivers: ['Pedro de la Rosa', 'Narain Karthikeyan'],
        models: [],
      },

      // === 2011 SEASON ===
      {
        id: '2011-redbull',
        year: 2011,
        team: 'Red Bull Racing',
        chassis: 'RB7',
        drivers: ['Sebastian Vettel', 'Mark Webber'],
        models: [],
      },
      {
        id: '2011-mclaren',
        year: 2011,
        team: 'McLaren',
        chassis: 'MP4-26',
        drivers: ['Lewis Hamilton', 'Jenson Button'],
        models: [],
      },
      {
        id: '2011-ferrari',
        year: 2011,
        team: 'Ferrari',
        chassis: '150° Italia',
        drivers: ['Fernando Alonso', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2011-mercedes',
        year: 2011,
        team: 'Mercedes',
        chassis: 'W02',
        drivers: ['Michael Schumacher', 'Nico Rosberg'],
        models: [],
      },
      {
        id: '2011-renault',
        year: 2011,
        team: 'Renault',
        chassis: 'R31',
        drivers: ['Nick Heidfeld', 'Vitaly Petrov'],
        models: [],
      },
      {
        id: '2011-sauber',
        year: 2011,
        team: 'Sauber',
        chassis: 'C30',
        drivers: ['Sergio Perez', 'Kamui Kobayashi'],
        models: [],
      },
      {
        id: '2011-forceindia',
        year: 2011,
        team: 'Force India',
        chassis: 'VJM04',
        drivers: ['Adrian Sutil', 'Paul di Resta'],
        models: [],
      },
      {
        id: '2011-tororosso',
        year: 2011,
        team: 'Toro Rosso',
        chassis: 'STR6',
        drivers: ['Sebastien Buemi', 'Jaime Alguersuari'],
        models: [],
      },
      {
        id: '2011-williams',
        year: 2011,
        team: 'Williams',
        chassis: 'FW33',
        drivers: ['Rubens Barrichello', 'Pastor Maldonado'],
        models: [],
      },
      {
        id: '2011-hrt',
        year: 2011,
        team: 'HRT',
        chassis: 'F111',
        drivers: ['Vitantonio Liuzzi', 'Narain Karthikeyan'],
        models: [],
      },
      {
        id: '2011-lotus',
        year: 2011,
        team: 'Team Lotus',
        chassis: 'T128',
        drivers: ['Jarno Trulli', 'Heikki Kovalainen'],
        models: [],
      },
      {
        id: '2011-virgin',
        year: 2011,
        team: 'Virgin Racing',
        chassis: 'MVR-02',
        drivers: ['Timo Glock', 'Jerome d\'Ambrosio'],
        models: [],
      },

      // === 2010 SEASON ===
      {
        id: '2010-redbull',
        year: 2010,
        team: 'Red Bull Racing',
        chassis: 'RB6',
        drivers: ['Sebastian Vettel', 'Mark Webber'],
        models: [],
      },
      {
        id: '2010-mclaren',
        year: 2010,
        team: 'McLaren',
        chassis: 'MP4-25',
        drivers: ['Lewis Hamilton', 'Jenson Button'],
        models: [],
      },
      {
        id: '2010-ferrari',
        year: 2010,
        team: 'Ferrari',
        chassis: 'F10',
        drivers: ['Fernando Alonso', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2010-mercedes',
        year: 2010,
        team: 'Mercedes',
        chassis: 'W01',
        drivers: ['Michael Schumacher', 'Nico Rosberg'],
        models: [],
      },
      {
        id: '2010-renault',
        year: 2010,
        team: 'Renault',
        chassis: 'R30',
        drivers: ['Robert Kubica', 'Vitaly Petrov'],
        models: [],
      },
      {
        id: '2010-williams',
        year: 2010,
        team: 'Williams',
        chassis: 'FW32',
        drivers: ['Rubens Barrichello', 'Nico Hulkenberg'],
        models: [],
      },
      {
        id: '2010-forceindia',
        year: 2010,
        team: 'Force India',
        chassis: 'VJM03',
        drivers: ['Adrian Sutil', 'Vitantonio Liuzzi'],
        models: [],
      },
      {
        id: '2010-sauber',
        year: 2010,
        team: 'Sauber',
        chassis: 'C29',
        drivers: ['Kamui Kobayashi', 'Pedro de la Rosa'],
        models: [],
      },
      {
        id: '2010-tororosso',
        year: 2010,
        team: 'Toro Rosso',
        chassis: 'STR5',
        drivers: ['Sebastien Buemi', 'Jaime Alguersuari'],
        models: [],
      },
      {
        id: '2010-lotus',
        year: 2010,
        team: 'Lotus Racing',
        chassis: 'T127',
        drivers: ['Jarno Trulli', 'Heikki Kovalainen'],
        models: [],
      },
      {
        id: '2010-hrt',
        year: 2010,
        team: 'HRT',
        chassis: 'F110',
        drivers: ['Karun Chandhok', 'Bruno Senna'],
        models: [],
      },
      {
        id: '2010-virgin',
        year: 2010,
        team: 'Virgin Racing',
        chassis: 'VR-01',
        drivers: ['Timo Glock', 'Lucas di Grassi'],
        models: [],
      },

      // === 2009 SEASON ===
      {
        id: '2009-brawn',
        year: 2009,
        team: 'Brawn GP',
        chassis: 'BGP 001',
        drivers: ['Jenson Button', 'Rubens Barrichello'],
        models: [],
      },
      {
        id: '2009-redbull',
        year: 2009,
        team: 'Red Bull Racing',
        chassis: 'RB5',
        drivers: ['Sebastian Vettel', 'Mark Webber'],
        models: [],
      },
      {
        id: '2009-mclaren',
        year: 2009,
        team: 'McLaren',
        chassis: 'MP4-24',
        drivers: ['Lewis Hamilton', 'Heikki Kovalainen'],
        models: [],
      },
      {
        id: '2009-ferrari',
        year: 2009,
        team: 'Ferrari',
        chassis: 'F60',
        drivers: ['Kimi Raikkonen', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2009-toyota',
        year: 2009,
        team: 'Toyota',
        chassis: 'TF109',
        drivers: ['Jarno Trulli', 'Timo Glock'],
        models: [],
      },
      {
        id: '2009-bmw',
        year: 2009,
        team: 'BMW Sauber',
        chassis: 'F1.09',
        drivers: ['Nick Heidfeld', 'Robert Kubica'],
        models: [],
      },
      {
        id: '2009-williams',
        year: 2009,
        team: 'Williams',
        chassis: 'FW31',
        drivers: ['Nico Rosberg', 'Kazuki Nakajima'],
        models: [],
      },
      {
        id: '2009-renault',
        year: 2009,
        team: 'Renault',
        chassis: 'R29',
        drivers: ['Fernando Alonso', 'Nelson Piquet Jr.'],
        models: [],
      },
      {
        id: '2009-tororosso',
        year: 2009,
        team: 'Toro Rosso',
        chassis: 'STR4',
        drivers: ['Sebastien Buemi', 'Sebastien Bourdais'],
        models: [],
      },
      {
        id: '2009-forceindia',
        year: 2009,
        team: 'Force India',
        chassis: 'VJM02',
        drivers: ['Giancarlo Fisichella', 'Adrian Sutil'],
        models: [],
      },

      // === 2008 SEASON ===
      {
        id: '2008-mclaren',
        year: 2008,
        team: 'McLaren',
        chassis: 'MP4-23',
        drivers: ['Lewis Hamilton', 'Heikki Kovalainen'],
        models: [],
      },
      {
        id: '2008-ferrari',
        year: 2008,
        team: 'Ferrari',
        chassis: 'F2008',
        drivers: ['Felipe Massa', 'Kimi Raikkonen'],
        models: [],
      },
      {
        id: '2008-bmw',
        year: 2008,
        team: 'BMW Sauber',
        chassis: 'F1.08',
        drivers: ['Robert Kubica', 'Nick Heidfeld'],
        models: [],
      },
      {
        id: '2008-renault',
        year: 2008,
        team: 'Renault',
        chassis: 'R28',
        drivers: ['Fernando Alonso', 'Nelson Piquet Jr.'],
        models: [],
      },
      {
        id: '2008-toyota',
        year: 2008,
        team: 'Toyota',
        chassis: 'TF108',
        drivers: ['Jarno Trulli', 'Timo Glock'],
        models: [],
      },
      {
        id: '2008-tororosso',
        year: 2008,
        team: 'Toro Rosso',
        chassis: 'STR3',
        drivers: ['Sebastian Vettel', 'Sebastien Bourdais'],
        models: [],
      },
      {
        id: '2008-redbull',
        year: 2008,
        team: 'Red Bull Racing',
        chassis: 'RB4',
        drivers: ['David Coulthard', 'Mark Webber'],
        models: [],
      },
      {
        id: '2008-williams',
        year: 2008,
        team: 'Williams',
        chassis: 'FW30',
        drivers: ['Nico Rosberg', 'Kazuki Nakajima'],
        models: [],
      },
      {
        id: '2008-honda',
        year: 2008,
        team: 'Honda',
        chassis: 'RA108',
        drivers: ['Rubens Barrichello', 'Jenson Button'],
        models: [],
      },
      {
        id: '2008-forceindia',
        year: 2008,
        team: 'Force India',
        chassis: 'VJM01',
        drivers: ['Giancarlo Fisichella', 'Adrian Sutil'],
        models: [],
      },
      {
        id: '2008-superaguri',
        year: 2008,
        team: 'Super Aguri',
        chassis: 'SA08',
        drivers: ['Takuma Sato', 'Anthony Davidson'],
        models: [],
      },

      // === 2007 SEASON ===
      {
        id: '2007-ferrari',
        year: 2007,
        team: 'Ferrari',
        chassis: 'F2007',
        drivers: ['Kimi Raikkonen', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2007-mclaren',
        year: 2007,
        team: 'McLaren',
        chassis: 'MP4-22',
        drivers: ['Fernando Alonso', 'Lewis Hamilton'],
        models: [],
      },
      {
        id: '2007-bmw',
        year: 2007,
        team: 'BMW Sauber',
        chassis: 'F1.07',
        drivers: ['Nick Heidfeld', 'Robert Kubica'],
        models: [],
      },
      {
        id: '2007-renault',
        year: 2007,
        team: 'Renault',
        chassis: 'R27',
        drivers: ['Giancarlo Fisichella', 'Heikki Kovalainen'],
        models: [],
      },
      {
        id: '2007-williams',
        year: 2007,
        team: 'Williams',
        chassis: 'FW29',
        drivers: ['Nico Rosberg', 'Alexander Wurz'],
        models: [],
      },
      {
        id: '2007-toyota',
        year: 2007,
        team: 'Toyota',
        chassis: 'TF107',
        drivers: ['Ralf Schumacher', 'Jarno Trulli'],
        models: [],
      },
      {
        id: '2007-redbull',
        year: 2007,
        team: 'Red Bull Racing',
        chassis: 'RB3',
        drivers: ['David Coulthard', 'Mark Webber'],
        models: [],
      },
      {
        id: '2007-tororosso',
        year: 2007,
        team: 'Toro Rosso',
        chassis: 'STR2',
        drivers: ['Vitantonio Liuzzi', 'Scott Speed'],
        models: [],
      },
      {
        id: '2007-honda',
        year: 2007,
        team: 'Honda',
        chassis: 'RA107',
        drivers: ['Rubens Barrichello', 'Jenson Button'],
        models: [],
      },
      {
        id: '2007-superaguri',
        year: 2007,
        team: 'Super Aguri',
        chassis: 'SA07',
        drivers: ['Takuma Sato', 'Anthony Davidson'],
        models: [],
      },
      {
        id: '2007-spyker',
        year: 2007,
        team: 'Spyker',
        chassis: 'F8-VII',
        drivers: ['Adrian Sutil', 'Christijan Albers'],
        models: [],
      },

      // === 2006 SEASON ===
      {
        id: '2006-renault',
        year: 2006,
        team: 'Renault',
        chassis: 'R26',
        drivers: ['Fernando Alonso', 'Giancarlo Fisichella'],
        models: [],
      },
      {
        id: '2006-ferrari',
        year: 2006,
        team: 'Ferrari',
        chassis: '248 F1',
        drivers: ['Michael Schumacher', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2006-mclaren',
        year: 2006,
        team: 'McLaren',
        chassis: 'MP4-21',
        drivers: ['Kimi Raikkonen', 'Juan Pablo Montoya'],
        models: [],
      },
      {
        id: '2006-honda',
        year: 2006,
        team: 'Honda',
        chassis: 'RA106',
        drivers: ['Jenson Button', 'Rubens Barrichello'],
        models: [],
      },
      {
        id: '2006-bmw',
        year: 2006,
        team: 'BMW Sauber',
        chassis: 'F1.06',
        drivers: ['Nick Heidfeld', 'Jacques Villeneuve'],
        models: [],
      },
      {
        id: '2006-toyota',
        year: 2006,
        team: 'Toyota',
        chassis: 'TF106',
        drivers: ['Ralf Schumacher', 'Jarno Trulli'],
        models: [],
      },
      {
        id: '2006-williams',
        year: 2006,
        team: 'Williams',
        chassis: 'FW28',
        drivers: ['Mark Webber', 'Nico Rosberg'],
        models: [],
      },
      {
        id: '2006-redbull',
        year: 2006,
        team: 'Red Bull Racing',
        chassis: 'RB2',
        drivers: ['David Coulthard', 'Christian Klien'],
        models: [],
      },
      {
        id: '2006-tororosso',
        year: 2006,
        team: 'Toro Rosso',
        chassis: 'STR1',
        drivers: ['Vitantonio Liuzzi', 'Scott Speed'],
        models: [],
      },
      {
        id: '2006-midland',
        year: 2006,
        team: 'Midland F1',
        chassis: 'M16',
        drivers: ['Christijan Albers', 'Tiago Monteiro'],
        models: [],
      },
      {
        id: '2006-superaguri',
        year: 2006,
        team: 'Super Aguri',
        chassis: 'SA05',
        drivers: ['Takuma Sato', 'Yuji Ide'],
        models: [],
      },

      // === 2005 SEASON ===
      {
        id: '2005-renault',
        year: 2005,
        team: 'Renault',
        chassis: 'R25',
        drivers: ['Fernando Alonso', 'Giancarlo Fisichella'],
        models: [],
      },
      {
        id: '2005-mclaren',
        year: 2005,
        team: 'McLaren',
        chassis: 'MP4-20',
        drivers: ['Kimi Raikkonen', 'Juan Pablo Montoya'],
        models: [],
      },
      {
        id: '2005-ferrari',
        year: 2005,
        team: 'Ferrari',
        chassis: 'F2005',
        drivers: ['Michael Schumacher', 'Rubens Barrichello'],
        models: [],
      },
      {
        id: '2005-toyota',
        year: 2005,
        team: 'Toyota',
        chassis: 'TF105',
        drivers: ['Ralf Schumacher', 'Jarno Trulli'],
        models: [],
      },
      {
        id: '2005-williams',
        year: 2005,
        team: 'Williams',
        chassis: 'FW27',
        drivers: ['Mark Webber', 'Nick Heidfeld'],
        models: [],
      },
      {
        id: '2005-bmw',
        year: 2005,
        team: 'Sauber',
        chassis: 'C24',
        drivers: ['Jacques Villeneuve', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2005-redbull',
        year: 2005,
        team: 'Red Bull Racing',
        chassis: 'RB1',
        drivers: ['David Coulthard', 'Christian Klien'],
        models: [],
      },
      {
        id: '2005-barchetta',
        year: 2005,
        team: 'BAR',
        chassis: '007',
        drivers: ['Jenson Button', 'Takuma Sato'],
        models: [],
      },
      {
        id: '2005-jordan',
        year: 2005,
        team: 'Jordan',
        chassis: 'EJ15',
        drivers: ['Tiago Monteiro', 'Narain Karthikeyan'],
        models: [],
      },
      {
        id: '2005-minardi',
        year: 2005,
        team: 'Minardi',
        chassis: 'PS05',
        drivers: ['Christijan Albers', 'Patrick Friesacher'],
        models: [],
      },

      // === 2004 SEASON ===
      {
        id: '2004-ferrari',
        year: 2004,
        team: 'Ferrari',
        chassis: 'F2004',
        drivers: ['Michael Schumacher', 'Rubens Barrichello'],
        models: [],
      },
      {
        id: '2004-bar',
        year: 2004,
        team: 'BAR',
        chassis: '006',
        drivers: ['Jenson Button', 'Takuma Sato'],
        models: [],
      },
      {
        id: '2004-renault',
        year: 2004,
        team: 'Renault',
        chassis: 'R24',
        drivers: ['Jarno Trulli', 'Fernando Alonso'],
        models: [],
      },
      {
        id: '2004-williams',
        year: 2004,
        team: 'Williams',
        chassis: 'FW26',
        drivers: ['Juan Pablo Montoya', 'Ralf Schumacher'],
        models: [],
      },
      {
        id: '2004-mclaren',
        year: 2004,
        team: 'McLaren',
        chassis: 'MP4-19',
        drivers: ['David Coulthard', 'Kimi Raikkonen'],
        models: [],
      },
      {
        id: '2004-sauber',
        year: 2004,
        team: 'Sauber',
        chassis: 'C23',
        drivers: ['Giancarlo Fisichella', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2004-jaguar',
        year: 2004,
        team: 'Jaguar',
        chassis: 'R5',
        drivers: ['Mark Webber', 'Christian Klien'],
        models: [],
      },
      {
        id: '2004-toyota',
        year: 2004,
        team: 'Toyota',
        chassis: 'TF104',
        drivers: ['Olivier Panis', 'Cristiano da Matta'],
        models: [],
      },
      {
        id: '2004-jordan',
        year: 2004,
        team: 'Jordan',
        chassis: 'EJ14',
        drivers: ['Nick Heidfeld', 'Giorgio Pantano'],
        models: [],
      },
      {
        id: '2004-minardi',
        year: 2004,
        team: 'Minardi',
        chassis: 'PS04',
        drivers: ['Gianmaria Bruni', 'Zsolt Baumgartner'],
        models: [],
      },

      // === 2003 SEASON ===
      {
        id: '2003-ferrari',
        year: 2003,
        team: 'Ferrari',
        chassis: 'F2003-GA',
        drivers: ['Michael Schumacher', 'Rubens Barrichello'],
        models: [],
      },
      {
        id: '2003-williams',
        year: 2003,
        team: 'Williams',
        chassis: 'FW25',
        drivers: ['Juan Pablo Montoya', 'Ralf Schumacher'],
        models: [],
      },
      {
        id: '2003-mclaren',
        year: 2003,
        team: 'McLaren',
        chassis: 'MP4-17D',
        drivers: ['Kimi Raikkonen', 'David Coulthard'],
        models: [],
      },
      {
        id: '2003-renault',
        year: 2003,
        team: 'Renault',
        chassis: 'R23',
        drivers: ['Fernando Alonso', 'Jarno Trulli'],
        models: [],
      },
      {
        id: '2003-sauber',
        year: 2003,
        team: 'Sauber',
        chassis: 'C22',
        drivers: ['Nick Heidfeld', 'Heinz-Harald Frentzen'],
        models: [],
      },
      {
        id: '2003-jaguar',
        year: 2003,
        team: 'Jaguar',
        chassis: 'R4',
        drivers: ['Mark Webber', 'Antônio Pizzonia'],
        models: [],
      },
      {
        id: '2003-toyota',
        year: 2003,
        team: 'Toyota',
        chassis: 'TF103',
        drivers: ['Olivier Panis', 'Cristiano da Matta'],
        models: [],
      },
      {
        id: '2003-jordan',
        year: 2003,
        team: 'Jordan',
        chassis: 'EJ13',
        drivers: ['Giancarlo Fisichella', 'Ralph Firman'],
        models: [],
      },
      {
        id: '2003-bar',
        year: 2003,
        team: 'BAR',
        chassis: '005',
        drivers: ['Jacques Villeneuve', 'Jenson Button'],
        models: [],
      },
      {
        id: '2003-minardi',
        year: 2003,
        team: 'Minardi',
        chassis: 'PS03',
        drivers: ['Jos Verstappen', 'Justin Wilson'],
        models: [],
      },

      // === 2002 SEASON ===
      {
        id: '2002-ferrari',
        year: 2002,
        team: 'Ferrari',
        chassis: 'F2002',
        drivers: ['Michael Schumacher', 'Rubens Barrichello'],
        models: [],
      },
      {
        id: '2002-williams',
        year: 2002,
        team: 'Williams',
        chassis: 'FW24',
        drivers: ['Juan Pablo Montoya', 'Ralf Schumacher'],
        models: [],
      },
      {
        id: '2002-mclaren',
        year: 2002,
        team: 'McLaren',
        chassis: 'MP4-17',
        drivers: ['David Coulthard', 'Kimi Raikkonen'],
        models: [],
      },
      {
        id: '2002-renault',
        year: 2002,
        team: 'Renault',
        chassis: 'R202',
        drivers: ['Jenson Button', 'Jarno Trulli'],
        models: [],
      },
      {
        id: '2002-sauber',
        year: 2002,
        team: 'Sauber',
        chassis: 'C21',
        drivers: ['Nick Heidfeld', 'Felipe Massa'],
        models: [],
      },
      {
        id: '2002-jordan',
        year: 2002,
        team: 'Jordan',
        chassis: 'EJ12',
        drivers: ['Giancarlo Fisichella', 'Takuma Sato'],
        models: [],
      },
      {
        id: '2002-bar',
        year: 2002,
        team: 'BAR',
        chassis: '004',
        drivers: ['Jacques Villeneuve', 'Olivier Panis'],
        models: [],
      },
      {
        id: '2002-jaguar',
        year: 2002,
        team: 'Jaguar',
        chassis: 'R3',
        drivers: ['Eddie Irvine', 'Pedro de la Rosa'],
        models: [],
      },
      {
        id: '2002-toyota',
        year: 2002,
        team: 'Toyota',
        chassis: 'TF102',
        drivers: ['Mika Salo', 'Allan McNish'],
        models: [],
      },
      {
        id: '2002-minardi',
        year: 2002,
        team: 'Minardi',
        chassis: 'PS02',
        drivers: ['Alex Yoong', 'Mark Webber'],
        models: [],
      },
      {
        id: '2002-arrows',
        year: 2002,
        team: 'Arrows',
        chassis: 'A23',
        drivers: ['Heinz-Harald Frentzen', 'Enrique Bernoldi'],
        models: [],
      },

      // === 2001 SEASON ===
      {
        id: '2001-ferrari',
        year: 2001,
        team: 'Ferrari',
        chassis: 'F2001',
        drivers: ['Michael Schumacher', 'Rubens Barrichello'],
        models: [],
      },
      {
        id: '2001-mclaren',
        year: 2001,
        team: 'McLaren',
        chassis: 'MP4-16',
        drivers: ['David Coulthard', 'Mika Hakkinen'],
        models: [],
      },
      {
        id: '2001-williams',
        year: 2001,
        team: 'Williams',
        chassis: 'FW23',
        drivers: ['Ralf Schumacher', 'Juan Pablo Montoya'],
        models: [],
      },
      {
        id: '2001-sauber',
        year: 2001,
        team: 'Sauber',
        chassis: 'C20',
        drivers: ['Nick Heidfeld', 'Kimi Raikkonen'],
        models: [],
      },
      {
        id: '2001-jordan',
        year: 2001,
        team: 'Jordan',
        chassis: 'EJ11',
        drivers: ['Jarno Trulli', 'Heinz-Harald Frentzen'],
        models: [],
      },
      {
        id: '2001-bar',
        year: 2001,
        team: 'BAR',
        chassis: '003',
        drivers: ['Jacques Villeneuve', 'Olivier Panis'],
        models: [],
      },
      {
        id: '2001-benetton',
        year: 2001,
        team: 'Benetton',
        chassis: 'B201',
        drivers: ['Giancarlo Fisichella', 'Jenson Button'],
        models: [],
      },
      {
        id: '2001-jaguar',
        year: 2001,
        team: 'Jaguar',
        chassis: 'R2',
        drivers: ['Eddie Irvine', 'Pedro de la Rosa'],
        models: [],
      },
      {
        id: '2001-prost',
        year: 2001,
        team: 'Prost',
        chassis: 'AP04',
        drivers: ['Jean Alesi', 'Luciano Burti'],
        models: [],
      },
      {
        id: '2001-arrows',
        year: 2001,
        team: 'Arrows',
        chassis: 'A22',
        drivers: ['Jos Verstappen', 'Enrique Bernoldi'],
        models: [],
      },
      {
        id: '2001-minardi',
        year: 2001,
        team: 'Minardi',
        chassis: 'PS01',
        drivers: ['Fernando Alonso', 'Tarso Marques'],
        models: [],
      },

      // === 2000 SEASON ===
      {
        id: '2000-ferrari',
        year: 2000,
        team: 'Ferrari',
        chassis: 'F1-2000',
        drivers: ['Michael Schumacher', 'Rubens Barrichello'],
        models: [],
      },
      {
        id: '2000-mclaren',
        year: 2000,
        team: 'McLaren',
        chassis: 'MP4-15',
        drivers: ['Mika Hakkinen', 'David Coulthard'],
        models: [],
      },
      {
        id: '2000-williams',
        year: 2000,
        team: 'Williams',
        chassis: 'FW22',
        drivers: ['Ralf Schumacher', 'Jenson Button'],
        models: [],
      },
      {
        id: '2000-benetton',
        year: 2000,
        team: 'Benetton',
        chassis: 'B200',
        drivers: ['Giancarlo Fisichella', 'Alexander Wurz'],
        models: [],
      },
      {
        id: '2000-jordan',
        year: 2000,
        team: 'Jordan',
        chassis: 'EJ10',
        drivers: ['Heinz-Harald Frentzen', 'Jarno Trulli'],
        models: [],
      },
      {
        id: '2000-bar',
        year: 2000,
        team: 'BAR',
        chassis: '002',
        drivers: ['Jacques Villeneuve', 'Ricardo Zonta'],
        models: [],
      },
      {
        id: '2000-arrows',
        year: 2000,
        team: 'Arrows',
        chassis: 'A21',
        drivers: ['Pedro de la Rosa', 'Jos Verstappen'],
        models: [],
      },
      {
        id: '2000-sauber',
        year: 2000,
        team: 'Sauber',
        chassis: 'C19',
        drivers: ['Pedro Diniz', 'Mika Salo'],
        models: [],
      },
      {
        id: '2000-jaguar',
        year: 2000,
        team: 'Jaguar',
        chassis: 'R1',
        drivers: ['Eddie Irvine', 'Johnny Herbert'],
        models: [],
      },
      {
        id: '2000-minardi',
        year: 2000,
        team: 'Minardi',
        chassis: 'M02',
        drivers: ['Marc Gene', 'Gaston Mazzacane'],
        models: [],
      },
      {
        id: '2000-prost',
        year: 2000,
        team: 'Prost',
        chassis: 'AP03',
        drivers: ['Jean Alesi', 'Nick Heidfeld'],
        models: [],
      },

      // === 1999 SEASON ===
      {
        id: '1999-ferrari',
        year: 1999,
        team: 'Ferrari',
        chassis: 'F399',
        drivers: ['Michael Schumacher', 'Eddie Irvine'],
        models: [],
      },
      {
        id: '1999-mclaren',
        year: 1999,
        team: 'McLaren',
        chassis: 'MP4/14',
        drivers: ['Mika Hakkinen', 'David Coulthard'],
        models: [],
      },
      {
        id: '1999-jordan',
        year: 1999,
        team: 'Jordan',
        chassis: '199',
        drivers: ['Damon Hill', 'Heinz-Harald Frentzen'],
        models: [],
      },
      {
        id: '1999-williams',
        year: 1999,
        team: 'Williams',
        chassis: 'FW21',
        drivers: ['Alex Zanardi', 'Ralf Schumacher'],
        models: [],
      },
      {
        id: '1999-benetton',
        year: 1999,
        team: 'Benetton',
        chassis: 'B199',
        drivers: ['Giancarlo Fisichella', 'Alexander Wurz'],
        models: [],
      },
      {
        id: '1999-stewart',
        year: 1999,
        team: 'Stewart',
        chassis: 'SF3',
        drivers: ['Rubens Barrichello', 'Johnny Herbert'],
        models: [],
      },
      {
        id: '1999-prost',
        year: 1999,
        team: 'Prost',
        chassis: 'AP02',
        drivers: ['Olivier Panis', 'Jarno Trulli'],
        models: [],
      },
      {
        id: '1999-sauber',
        year: 1999,
        team: 'Sauber',
        chassis: 'C18',
        drivers: ['Jean Alesi', 'Pedro Diniz'],
        models: [],
      },
      {
        id: '1999-arrows',
        year: 1999,
        team: 'Arrows',
        chassis: 'A20',
        drivers: ['Pedro de la Rosa', 'Toranosuke Takagi'],
        models: [],
      },
      {
        id: '1999-minardi',
        year: 1999,
        team: 'Minardi',
        chassis: 'M01',
        drivers: ['Luca Badoer', 'Marc Gene'],
        models: [],
      },
      {
        id: '1999-bar',
        year: 1999,
        team: 'BAR',
        chassis: '01',
        drivers: ['Jacques Villeneuve', 'Ricardo Zonta'],
        models: [],
      },

      // === 1998 SEASON ===
      {
        id: '1998-mclaren',
        year: 1998,
        team: 'McLaren',
        chassis: 'MP4/13',
        drivers: ['Mika Hakkinen', 'David Coulthard'],
        models: [],
      },
      {
        id: '1998-ferrari',
        year: 1998,
        team: 'Ferrari',
        chassis: 'F300',
        drivers: ['Michael Schumacher', 'Eddie Irvine'],
        models: [],
      },
      {
        id: '1998-williams',
        year: 1998,
        team: 'Williams',
        chassis: 'FW20',
        drivers: ['Jacques Villeneuve', 'Heinz-Harald Frentzen'],
        models: [],
      },
      {
        id: '1998-jordan',
        year: 1998,
        team: 'Jordan',
        chassis: '198',
        drivers: ['Damon Hill', 'Ralf Schumacher'],
        models: [],
      },
      {
        id: '1998-benetton',
        year: 1998,
        team: 'Benetton',
        chassis: 'B198',
        drivers: ['Giancarlo Fisichella', 'Alexander Wurz'],
        models: [],
      },
      {
        id: '1998-sauber',
        year: 1998,
        team: 'Sauber',
        chassis: 'C17',
        drivers: ['Johnny Herbert', 'Jean Alesi'],
        models: [],
      },
      {
        id: '1998-arrows',
        year: 1998,
        team: 'Arrows',
        chassis: 'A19',
        drivers: ['Mika Salo', 'Pedro Diniz'],
        models: [],
      },
      {
        id: '1998-stewart',
        year: 1998,
        team: 'Stewart',
        chassis: 'SF02',
        drivers: ['Rubens Barrichello', 'Jan Magnussen'],
        models: [],
      },
      {
        id: '1998-prost',
        year: 1998,
        team: 'Prost',
        chassis: 'AP01',
        drivers: ['Olivier Panis', 'Jarno Trulli'],
        models: [],
      },
      {
        id: '1998-tyrrell',
        year: 1998,
        team: 'Tyrrell',
        chassis: '026',
        drivers: ['Ricardo Rosset', 'Toranosuke Takagi'],
        models: [],
      },
      {
        id: '1998-minardi',
        year: 1998,
        team: 'Minardi',
        chassis: 'M198',
        drivers: ['Shinji Nakano', 'Esteban Tuero'],
        models: [],
      },

      // === 1997 SEASON ===
      {
        id: '1997-williams',
        year: 1997,
        team: 'Williams',
        chassis: 'FW19',
        drivers: ['Jacques Villeneuve', 'Heinz-Harald Frentzen'],
        models: [],
      },
      {
        id: '1997-ferrari',
        year: 1997,
        team: 'Ferrari',
        chassis: 'F310B',
        drivers: ['Michael Schumacher', 'Eddie Irvine'],
        models: [],
      },
      {
        id: '1997-benetton',
        year: 1997,
        team: 'Benetton',
        chassis: 'B197',
        drivers: ['Jean Alesi', 'Gerhard Berger'],
        models: [],
      },
      {
        id: '1997-mclaren',
        year: 1997,
        team: 'McLaren',
        chassis: 'MP4/12',
        drivers: ['David Coulthard', 'Mika Hakkinen'],
        models: [],
      },
      {
        id: '1997-jordan',
        year: 1997,
        team: 'Jordan',
        chassis: '197',
        drivers: ['Giancarlo Fisichella', 'Ralf Schumacher'],
        models: [],
      },
      {
        id: '1997-prost',
        year: 1997,
        team: 'Prost',
        chassis: 'JS45',
        drivers: ['Olivier Panis', 'Shinji Nakano'],
        models: [],
      },
      {
        id: '1997-sauber',
        year: 1997,
        team: 'Sauber',
        chassis: 'C16',
        drivers: ['Johnny Herbert', 'Nicola Larini'],
        models: [],
      },
      {
        id: '1997-arrows',
        year: 1997,
        team: 'Arrows',
        chassis: 'A18',
        drivers: ['Damon Hill', 'Pedro Diniz'],
        models: [],
      },
      {
        id: '1997-stewart',
        year: 1997,
        team: 'Stewart',
        chassis: 'SF01',
        drivers: ['Rubens Barrichello', 'Jan Magnussen'],
        models: [],
      },
      {
        id: '1997-tyrrell',
        year: 1997,
        team: 'Tyrrell',
        chassis: '025',
        drivers: ['Mika Salo', 'Jos Verstappen'],
        models: [],
      },
      {
        id: '1997-minardi',
        year: 1997,
        team: 'Minardi',
        chassis: 'M197',
        drivers: ['Ukyo Katayama', 'Jarno Trulli'],
        models: [],
      },
      {
        id: '1997-lola',
        year: 1997,
        team: 'Lola',
        chassis: 'T97/30',
        drivers: ['Vincenzo Sospiri', 'Ricardo Rosset'],
        models: [],
      },

      // === 1996 SEASON ===
      {
        id: '1996-williams',
        year: 1996,
        team: 'Williams',
        chassis: 'FW18',
        drivers: ['Damon Hill', 'Jacques Villeneuve'],
        models: [],
      },
      {
        id: '1996-ferrari',
        year: 1996,
        team: 'Ferrari',
        chassis: 'F310',
        drivers: ['Michael Schumacher', 'Eddie Irvine'],
        models: [],
      },
      {
        id: '1996-benetton',
        year: 1996,
        team: 'Benetton',
        chassis: 'B196',
        drivers: ['Jean Alesi', 'Gerhard Berger'],
        models: [],
      },
      {
        id: '1996-mclaren',
        year: 1996,
        team: 'McLaren',
        chassis: 'MP4/11',
        drivers: ['David Coulthard', 'Mika Hakkinen'],
        models: [],
      },
      {
        id: '1996-jordan',
        year: 1996,
        team: 'Jordan',
        chassis: '196',
        drivers: ['Rubens Barrichello', 'Martin Brundle'],
        models: [],
      },
      {
        id: '1996-ligier',
        year: 1996,
        team: 'Ligier',
        chassis: 'JS43',
        drivers: ['Olivier Panis', 'Pedro Diniz'],
        models: [],
      },
      {
        id: '1996-sauber',
        year: 1996,
        team: 'Sauber',
        chassis: 'C15',
        drivers: ['Johnny Herbert', 'Heinz-Harald Frentzen'],
        models: [],
      },
      {
        id: '1996-tyrrell',
        year: 1996,
        team: 'Tyrrell',
        chassis: '024',
        drivers: ['Ukyo Katayama', 'Mika Salo'],
        models: [],
      },
      {
        id: '1996-footwork',
        year: 1996,
        team: 'Footwork',
        chassis: 'FA17',
        drivers: ['Jos Verstappen', 'Ricardo Rosset'],
        models: [],
      },
      {
        id: '1996-minardi',
        year: 1996,
        team: 'Minardi',
        chassis: 'M195B',
        drivers: ['Giancarlo Fisichella', 'Pedro Lamy'],
        models: [],
      },
      {
        id: '1996-forti',
        year: 1996,
        team: 'Forti',
        chassis: 'FG03',
        drivers: ['Luca Badoer', 'Andrea Montermini'],
        models: [],
      },

      // === 1995 SEASON ===
      {
        id: '1995-benetton',
        year: 1995,
        team: 'Benetton',
        chassis: 'B195',
        drivers: ['Michael Schumacher', 'Johnny Herbert'],
        models: [],
      },
      {
        id: '1995-williams',
        year: 1995,
        team: 'Williams',
        chassis: 'FW17',
        drivers: ['Damon Hill', 'David Coulthard'],
        models: [],
      },
      {
        id: '1995-ferrari',
        year: 1995,
        team: 'Ferrari',
        chassis: '412 T2',
        drivers: ['Jean Alesi', 'Gerhard Berger'],
        models: [],
      },
      {
        id: '1995-mclaren',
        year: 1995,
        team: 'McLaren',
        chassis: 'MP4/10',
        drivers: ['Mika Hakkinen', 'Mark Blundell'],
        models: [],
      },
      {
        id: '1995-ligier',
        year: 1995,
        team: 'Ligier',
        chassis: 'JS41',
        drivers: ['Martin Brundle', 'Olivier Panis'],
        models: [],
      },
      {
        id: '1995-jordan',
        year: 1995,
        team: 'Jordan',
        chassis: '195',
        drivers: ['Rubens Barrichello', 'Eddie Irvine'],
        models: [],
      },
      {
        id: '1995-sauber',
        year: 1995,
        team: 'Sauber',
        chassis: 'C14',
        drivers: ['Heinz-Harald Frentzen', 'Jean-Christophe Boullion'],
        models: [],
      },
      {
        id: '1995-footwork',
        year: 1995,
        team: 'Footwork',
        chassis: 'FA16',
        drivers: ['Giancarlo Fisichella', 'Max Papis'],
        models: [],
      },
      {
        id: '1995-tyrrell',
        year: 1995,
        team: 'Tyrrell',
        chassis: '023',
        drivers: ['Mika Salo', 'Ukyo Katayama'],
        models: [],
      },
      {
        id: '1995-minardi',
        year: 1995,
        team: 'Minardi',
        chassis: 'M195',
        drivers: ['Pierluigi Martini', 'Luca Badoer'],
        models: [],
      },
      {
        id: '1995-forti',
        year: 1995,
        team: 'Forti',
        chassis: 'FG01',
        drivers: ['Pedro Diniz', 'Roberto Moreno'],
        models: [],
      },
      {
        id: '1995-pacific',
        year: 1995,
        team: 'Pacific',
        chassis: 'PR02',
        drivers: ['Andrea Montermini', 'Giovanni Lavaggi'],
        models: [],
      },
    ];
    setF1Cars(mockF1Cars);
  }, []);

  const toggleCarExpand = (carId: string) => {
    setExpandedCars((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(carId)) {
        newSet.delete(carId);
      } else {
        newSet.add(carId);
      }
      return newSet;
    });
  };

  const searchEbay = async (model: DiecastModel, car: F1Car) => {
    setLoading(true);
    setSelectedModel(model);
    setSearchResults([]);

    try {
      // Build search query from model info
      const searchQuery = `${model.manufacturer} ${model.scale} ${car.team} ${model.driver} ${car.year}`;

      const response = await fetch('/api/admin/scrape-ebay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchQuery }),
      });

      if (!response.ok) {
        throw new Error('Failed to scrape eBay');
      }

      const data = await response.json();
      setSearchResults(data.listings || []);
    } catch (error) {
      console.error('Error searching eBay:', error);
      alert('Failed to search eBay. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const saveEbayLink = async (carId: string, model: DiecastModel, listing: EbaySearchResult) => {
    try {
      console.log('💾 Saving eBay link to database...');

      // Save to Supabase
      const response = await fetch('/api/admin/save-ebay-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: model.id,
          carId: carId,
          ebayUrl: listing.url,
          ebayPrice: listing.price,
          ebayTitle: listing.title,
          ebayImage: listing.image,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save eBay link');
      }

      console.log('✅ eBay link saved to database');

      // Update local state
      setF1Cars((prev) =>
        prev.map((car) =>
          car.id === carId
            ? {
                ...car,
                models: car.models.map((m) =>
                  m.id === model.id
                    ? {
                        ...m,
                        ebayLinked: true,
                        ebayUrl: listing.url,
                        ebayPrice: listing.price,
                        lastUpdated: 'just now',
                      }
                    : m
                ),
              }
            : car
        )
      );

      setSearchResults([]);
      setSelectedModel(null);
      alert('✅ eBay link saved to database!');
    } catch (error: any) {
      console.error('Error saving eBay link:', error);
      alert(`❌ Failed to save: ${error.message}`);
    }
  };

  const removeEbayLink = async (carId: string, model: DiecastModel) => {
    if (!confirm('Remove eBay link for this model?')) return;

    try {
      // TODO: Remove from Supabase
      console.log('Removing eBay link for model:', model.id);

      setF1Cars((prev) =>
        prev.map((car) =>
          car.id === carId
            ? {
                ...car,
                models: car.models.map((m) =>
                  m.id === model.id
                    ? {
                        ...m,
                        ebayLinked: false,
                        ebayUrl: undefined,
                        ebayPrice: undefined,
                        lastUpdated: undefined,
                      }
                    : m
                ),
              }
            : car
        )
      );

      alert('eBay link removed');
    } catch (error) {
      console.error('Error removing eBay link:', error);
      alert('Failed to remove eBay link');
    }
  };

  const filteredCars = f1Cars.filter((car) => {
    const matchesYear = selectedYear === null || car.year === selectedYear;

    const matchesSearch =
      searchTerm === '' ||
      car.team.toLowerCase().includes(searchTerm.toLowerCase()) ||
      car.chassis.toLowerCase().includes(searchTerm.toLowerCase()) ||
      car.drivers.some((d) => d.toLowerCase().includes(searchTerm.toLowerCase()));

    // Filter by eBay linking status
    if (filter === 'linked') {
      return matchesYear && matchesSearch && car.models.some((m) => m.ebayLinked);
    } else if (filter === 'unlinked') {
      return matchesYear && matchesSearch && car.models.some((m) => !m.ebayLinked);
    }

    return matchesYear && matchesSearch;
  });

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-secondary)]">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
              🛡️ eBay Linking Admin
            </h1>
            <p className="text-[var(--text-secondary)]">
              Manually curate eBay listings for your models. Free tier: 13 searches/month.
            </p>
          </div>
          <button
            onClick={async () => {
              const carsWithModels = f1Cars.filter(car => car.models.length > 0);
              const totalModels = carsWithModels.reduce((sum, car) => sum + car.models.length, 0);

              if (confirm(`Import ${carsWithModels.length} cars with ${totalModels} models to Supabase?`)) {
                try {
                  const response = await fetch('/api/admin/import-f1-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cars: carsWithModels }),
                  });
                  const data = await response.json();
                  if (data.success) {
                    alert(`✅ Success! Imported ${data.carsImported} cars and ${data.modelsImported} models`);
                  } else {
                    alert(`❌ Error: ${data.error}`);
                  }
                } catch (error) {
                  alert(`❌ Failed to import: ${error}`);
                }
              }
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            📤 Import to Supabase
          </button>
        </div>

        {/* Year Selector - Season Boxes */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Select Season</h2>
          <div className="grid grid-cols-6 md:grid-cols-10 lg:grid-cols-15 gap-2">
            <button
              onClick={() => setSelectedYear(null)}
              className={`px-3 py-2 rounded-lg border transition-colors ${
                selectedYear === null
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-blue-500'
              }`}
            >
              All
            </button>
            {years.map((year) => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-3 py-2 rounded-lg border transition-colors ${
                  selectedYear === year
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-blue-500'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[var(--bg-primary)] rounded-lg p-6 mb-6 border border-[var(--border-color)]">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-sm text-[var(--text-secondary)] mb-2 block">Filter</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="all">All Models</option>
                <option value="linked">eBay Linked</option>
                <option value="unlinked">Not Linked</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="text-sm text-[var(--text-secondary)] mb-2 block">Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, team, driver..."
                className="w-full px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div className="mt-4 text-sm text-[var(--text-secondary)]">
            {selectedYear ? `${selectedYear} Season - ` : ''}Showing {filteredCars.length} F1 cars
          </div>
        </div>

        {/* F1 Cars List */}
        <div className="space-y-4">
          {filteredCars.map((car) => {
            const isExpanded = expandedCars.has(car.id);
            const linkedCount = car.models.filter((m) => m.ebayLinked).length;
            const totalModels = car.models.length;

            return (
              <div
                key={car.id}
                className="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] overflow-hidden"
              >
                {/* Car Header - Always Visible */}
                <button
                  onClick={() => toggleCarExpand(car.id)}
                  className="w-full p-6 flex items-center justify-between hover:bg-[var(--bg-secondary)] transition-colors text-left"
                >
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
                      📦 {car.year} {car.team} - {car.chassis}
                    </h3>
                    <div className="flex gap-3 text-sm text-[var(--text-secondary)]">
                      <span>Drivers: {car.drivers.join(', ')}</span>
                      <span>•</span>
                      <span>
                        {totalModels} model{totalModels !== 1 ? 's' : ''}
                      </span>
                      {totalModels > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-green-400">
                            {linkedCount} linked to eBay
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-[var(--text-secondary)]">
                    {isExpanded ? '▼' : '▶'}
                  </div>
                </button>

                {/* Expanded Models List */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    {car.models.length === 0 ? (
                      <div className="p-6 text-center text-[var(--text-secondary)]">
                        ⚠️ No diecast models documented for this chassis yet.
                      </div>
                    ) : (
                      <div className="p-6 space-y-4">
                        {car.models.map((model) => (
                          <div
                            key={model.id}
                            className="bg-[var(--bg-primary)] rounded-lg p-4 border border-[var(--border-color)]"
                          >
                            {/* Model Info */}
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-semibold text-[var(--text-primary)] mb-1">
                                  {model.name}
                                </h4>
                                <div className="flex gap-2 text-sm text-[var(--text-secondary)]">
                                  <span>{model.manufacturer}</span>
                                  <span>•</span>
                                  <span>{model.scale}</span>
                                  <span>•</span>
                                  <span>{model.eventName}</span>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                {!model.ebayLinked ? (
                                  <button
                                    onClick={() => searchEbay(model, car)}
                                    disabled={loading}
                                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    🔍 Search eBay
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => removeEbayLink(car.id, model)}
                                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* eBay Status */}
                            {model.ebayLinked ? (
                              <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-green-400 font-semibold text-sm">
                                    ✓ eBay Linked
                                  </span>
                                </div>
                                <div className="text-xs text-[var(--text-secondary)] space-y-1">
                                  <div>
                                    Price:{' '}
                                    <span className="text-[var(--text-primary)]">
                                      {model.ebayPrice}
                                    </span>
                                  </div>
                                  <div>
                                    Last updated:{' '}
                                    <span className="text-[var(--text-primary)]">
                                      {model.lastUpdated}
                                    </span>
                                  </div>
                                  <div>
                                    <a
                                      href={model.ebayUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:underline"
                                    >
                                      View on eBay →
                                    </a>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-gray-800/20 border border-gray-700/30 rounded-lg p-3">
                                <span className="text-gray-400 text-sm">🛑 Not linked</span>
                              </div>
                            )}

                            {/* Search Results */}
                            {selectedModel?.id === model.id && searchResults.length > 0 && (
                              <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                                <h5 className="text-xs font-semibold text-[var(--text-primary)] mb-2">
                                  eBay Search Results
                                </h5>
                                <div className="space-y-2">
                                  {searchResults.slice(0, 5).map((result, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-3 bg-[var(--bg-secondary)] p-2 rounded-lg border border-[var(--border-color)]"
                                    >
                                      <img
                                        src={result.image || '/placeholder.png'}
                                        alt={result.title}
                                        className="w-12 h-12 object-cover rounded"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs text-[var(--text-primary)] mb-1 truncate">
                                          {result.title}
                                        </div>
                                        <div className="text-xs font-semibold text-green-400">
                                          {result.price}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => saveEbayLink(car.id, model, result)}
                                        className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                      >
                                        Select
                                      </button>
                                      <a
                                        href={result.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-600"
                                      >
                                        View
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Loading State */}
                            {selectedModel?.id === model.id && loading && (
                              <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                                <div className="text-center py-4 text-[var(--text-secondary)]">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
                                  <span className="text-xs">Scraping eBay...</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredCars.length === 0 && (
          <div className="text-center py-12 text-[var(--text-secondary)]">
            No F1 cars found matching your filters.
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
