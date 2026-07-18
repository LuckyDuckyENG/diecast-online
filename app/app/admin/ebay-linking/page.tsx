'use client';

import { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { DndContext, DragEndEvent, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

interface RetailerPrice {
  retailerId: string;
  retailerName: string;
  productUrl: string;
  price: string;
  currency: string;
  priceAud: number;
  inStock: boolean;
  recordedAt: string;
}

interface DiecastModel {
  id: string;
  name: string; // e.g., "Spark 1:43 - Bahrain GP - Hamilton"
  manufacturer: string;
  scale: string;
  driver: string;
  eventName: string; // e.g., "Bahrain GP 2024"
  sku?: string;
  discoveredFrom?: string | null; // Retailer name
  price?: string | null; // Price from retailer
  ebayLinked?: boolean;
  ebayUrl?: string;
  ebayPrice?: string;
  lastUpdated?: string;
  retailerPrices?: RetailerPrice[]; // All retailer prices from price_history table
}

interface DriverGroup {
  driver: string;
  models: DiecastModel[];
}

interface F1Car {
  id: string;
  year: number;
  team: string;
  chassis: string; // e.g., "W15", "RB20", "SF-24"
  driverGroups: DriverGroup[]; // Models grouped by driver
}

interface EbaySearchResult {
  title: string;
  price: string;
  url: string;
  image: string;
  score?: number; // AI confidence score 0-100
  aiReason?: string; // AI reasoning for the score
}

interface RetailerSearchResult {
  retailerId: number;
  retailerName: string;
  title: string;
  price: string;
  url: string;
  image: string;
  inStock: boolean;
}

// Droppable Model Card Component
function DroppableModelCard({ modelId, children }: { modelId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: modelId,
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all ${
        isOver ? 'ring-2 ring-orange-500 bg-orange-500/10' : ''
      }`}
    >
      {children}
    </div>
  );
}

// Droppable Create New Model Zone
function DroppableCreateModelZone({ carId }: { carId: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `create-new-${carId}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`mx-6 my-4 p-6 border-2 border-dashed rounded-lg transition-all ${
        isOver
          ? 'border-green-500 bg-green-500/10'
          : 'border-gray-600 bg-gray-800/30'
      }`}
    >
      <div className="text-center">
        <div className="text-2xl mb-2">➕</div>
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          Create New Model
        </div>
        <div className="text-xs text-gray-400 mt-1">
          Drag an inventory item here to create a new model
        </div>
      </div>
    </div>
  );
}

// Draggable Inventory Item Component
function DraggableInventoryItem({ item }: { item: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.8 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 9999 : 'auto',
    pointerEvents: isDragging ? ('auto' as const) : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-color)] hover:border-orange-500 transition-colors"
    >
      <img
        src={item.image_url || '/placeholder.png'}
        alt={item.title}
        className="w-full h-32 object-cover rounded mb-2"
      />
      <div className="text-xs text-[var(--text-primary)] mb-1 line-clamp-2">
        {item.title}
      </div>
      <div className="text-xs font-semibold text-green-400 mb-2">
        {item.price}
      </div>
      <div className="text-xs text-gray-400 mb-2">
        🤖 Score: {item.ai_score}
      </div>
      <div className="text-xs text-gray-500 mb-3 line-clamp-2">
        {item.ai_reason}
      </div>
      <div className="flex gap-2">
        <button className="flex-1 px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">
          🗑️ Delete
        </button>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 px-2 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-600 text-center"
        >
          View
        </a>
      </div>
    </div>
  );
}

export default function EbayLinkingAdmin() {
  const [f1Cars, setF1Cars] = useState<F1Car[]>([]);
  const [searchResults, setSearchResults] = useState<EbaySearchResult[]>([]);
  const [retailerResults, setRetailerResults] = useState<RetailerSearchResult[]>([]);
  const [selectedModel, setSelectedModel] = useState<DiecastModel | null>(null);
  const [expandedCars, setExpandedCars] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingRetailers, setLoadingRetailers] = useState(false);
  const [filter, setFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [inventorySidebarOpen, setInventorySidebarOpen] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [createModelModalOpen, setCreateModelModalOpen] = useState(false);
  const [newModelData, setNewModelData] = useState({
    manufacturer: '',
    scale: '',
    driver: '',
    eventName: '',
    sku: '',
    inventoryItemId: '',
    carId: '',
    title: '',
    price: '',
    url: '',
    imageUrl: '',
  });

  // Add Model modal state
  const [addModelModalOpen, setAddModelModalOpen] = useState(false);
  const [addModelForm, setAddModelForm] = useState({
    manufacturer: '',
    scale: '',
    sku: '',
    year: '2024',
    team: '',
    driver: '',
    eventName: '',
    price: '',
    imageUrl: '',
  });
  const [searchedCar, setSearchedCar] = useState<any>(null);
  const [searchingCar, setSearchingCar] = useState(false);

  // Generate years from 1995 to 2025
  const years = Array.from({ length: 31 }, (_, i) => 2025 - i); // 2025 down to 1995

  // Load F1 cars from Supabase
  useEffect(() => {
    const loadF1Data = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/admin/get-f1-data');
        const data = await response.json();

        if (data.success) {
          setF1Cars(data.cars);
          console.log(`✅ Loaded ${data.cars.length} cars from Supabase`);
        } else {
          console.error('Failed to load F1 data:', data.error);
          // Fallback to mock data if needed
        }
      } catch (error) {
        console.error('Error loading F1 data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadF1Data();
  }, []);

  // Load inventory count
  useEffect(() => {
    const loadInventoryCount = async () => {
      try {
        const response = await fetch('/api/admin/get-inventory-count');
        const data = await response.json();
        if (data.success) {
          setInventoryCount(data.count);
        }
      } catch (error) {
        console.error('Error loading inventory count:', error);
      }
    };

    loadInventoryCount();
  }, []);

  // Load inventory items when sidebar opens
  useEffect(() => {
    const loadInventoryItems = async () => {
      if (!inventorySidebarOpen) return;

      try {
        const response = await fetch('/api/admin/get-inventory');
        const data = await response.json();
        if (data.success) {
          setInventoryItems(data.items);
        }
      } catch (error) {
        console.error('Error loading inventory items:', error);
      }
    };

    loadInventoryItems();
  }, [inventorySidebarOpen]);

  // Keep mock data for reference (can be removed later)
  const loadMockData = () => {
    const mockF1Cars: F1Car[] = [
      // === 2025 SEASON ===
      {
        id: '2025-mercedes',
        year: 2025,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W16',
        driverGroups: [], // Empty - to be filled later
      },
      {
        id: '2025-redbull',
        year: 2025,
        team: 'Red Bull Racing',
        chassis: 'RB21',
        driverGroups: [],
      },
      {
        id: '2025-ferrari',
        year: 2025,
        team: 'Ferrari',
        chassis: 'SF-25',
        driverGroups: [],
      },
      {
        id: '2025-mclaren',
        year: 2025,
        team: 'McLaren',
        chassis: 'MCL39',
        driverGroups: [],
      },
      {
        id: '2025-astonmartin',
        year: 2025,
        team: 'Aston Martin',
        chassis: 'AMR25',
        driverGroups: [],
      },
      {
        id: '2025-alpine',
        year: 2025,
        team: 'Alpine',
        chassis: 'A525',
        driverGroups: [],
      },
      {
        id: '2025-haas',
        year: 2025,
        team: 'Haas',
        chassis: 'VF-25',
        driverGroups: [],
      },
      {
        id: '2025-rb',
        year: 2025,
        team: 'RB',
        chassis: 'VCARB 02',
        driverGroups: [],
      },
      {
        id: '2025-sauber',
        year: 2025,
        team: 'Sauber',
        chassis: 'C45',
        driverGroups: [],
      },
      {
        id: '2025-williams',
        year: 2025,
        team: 'Williams',
        chassis: 'FW47',
        driverGroups: [],
      },

      // === 2024 SEASON ===
      {
        id: '2024-mercedes',
        year: 2024,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W15',
        driverGroups: [],
      },
      {
        id: '2024-redbull',
        year: 2024,
        team: 'Red Bull Racing',
        chassis: 'RB20',
        driverGroups: [],
      },
      {
        id: '2024-ferrari',
        year: 2024,
        team: 'Ferrari',
        chassis: 'SF-24',
        driverGroups: [],
      },
      {
        id: '2024-mclaren',
        year: 2024,
        team: 'McLaren',
        chassis: 'MCL38',
        driverGroups: [],
      },
      {
        id: '2024-astonmartin',
        year: 2024,
        team: 'Aston Martin',
        chassis: 'AMR24',
        driverGroups: [],
      },
      {
        id: '2024-alpine',
        year: 2024,
        team: 'Alpine',
        chassis: 'A524',
        driverGroups: [],
      },
      {
        id: '2024-haas',
        year: 2024,
        team: 'Haas',
        chassis: 'VF-24',
        driverGroups: [],
      },
      {
        id: '2024-rb',
        year: 2024,
        team: 'RB',
        chassis: 'VCARB 01',
        driverGroups: [],
      },
      {
        id: '2024-sauber',
        year: 2024,
        team: 'Sauber',
        chassis: 'C44',
        driverGroups: [],
      },
      {
        id: '2024-williams',
        year: 2024,
        team: 'Williams',
        chassis: 'FW46',
        driverGroups: [],
      },

      // === 2023 SEASON ===
      {
        id: '2023-mercedes',
        year: 2023,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W14',
        driverGroups: [],
      },
      {
        id: '2023-redbull',
        year: 2023,
        team: 'Red Bull Racing',
        chassis: 'RB19',
        driverGroups: [],
      },
      {
        id: '2023-ferrari',
        year: 2023,
        team: 'Ferrari',
        chassis: 'SF-23',
        driverGroups: [],
      },
      {
        id: '2023-mclaren',
        year: 2023,
        team: 'McLaren',
        chassis: 'MCL60',
        driverGroups: [],
      },
      {
        id: '2023-astonmartin',
        year: 2023,
        team: 'Aston Martin',
        chassis: 'AMR23',
        driverGroups: [],
      },
      {
        id: '2023-alpine',
        year: 2023,
        team: 'Alpine',
        chassis: 'A523',
        driverGroups: [],
      },
      {
        id: '2023-haas',
        year: 2023,
        team: 'Haas',
        chassis: 'VF-23',
        driverGroups: [],
      },
      {
        id: '2023-alphatauri',
        year: 2023,
        team: 'AlphaTauri',
        chassis: 'AT04',
        driverGroups: [],
      },
      {
        id: '2023-alfaromeo',
        year: 2023,
        team: 'Alfa Romeo',
        chassis: 'C43',
        driverGroups: [],
      },
      {
        id: '2023-williams',
        year: 2023,
        team: 'Williams',
        chassis: 'FW45',
        driverGroups: [],
      },

      // === 2022 SEASON ===
      {
        id: '2022-mercedes',
        year: 2022,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W13',
        driverGroups: [],
      },
      {
        id: '2022-redbull',
        year: 2022,
        team: 'Red Bull Racing',
        chassis: 'RB18',
        driverGroups: [],
      },
      {
        id: '2022-ferrari',
        year: 2022,
        team: 'Ferrari',
        chassis: 'F1-75',
        driverGroups: [],
      },
      {
        id: '2022-mclaren',
        year: 2022,
        team: 'McLaren',
        chassis: 'MCL36',
        driverGroups: [],
      },
      {
        id: '2022-astonmartin',
        year: 2022,
        team: 'Aston Martin',
        chassis: 'AMR22',
        driverGroups: [],
      },
      {
        id: '2022-alpine',
        year: 2022,
        team: 'Alpine',
        chassis: 'A522',
        driverGroups: [],
      },
      {
        id: '2022-haas',
        year: 2022,
        team: 'Haas',
        chassis: 'VF-22',
        driverGroups: [],
      },
      {
        id: '2022-alphatauri',
        year: 2022,
        team: 'AlphaTauri',
        chassis: 'AT03',
        driverGroups: [],
      },
      {
        id: '2022-alfaromeo',
        year: 2022,
        team: 'Alfa Romeo',
        chassis: 'C42',
        driverGroups: [],
      },
      {
        id: '2022-williams',
        year: 2022,
        team: 'Williams',
        chassis: 'FW44',
        driverGroups: [],
      },

      // === 2021 SEASON ===
      {
        id: '2021-mercedes',
        year: 2021,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W12',
        driverGroups: [],
      },
      {
        id: '2021-redbull',
        year: 2021,
        team: 'Red Bull Racing',
        chassis: 'RB16B',
        driverGroups: [],
      },
      {
        id: '2021-ferrari',
        year: 2021,
        team: 'Ferrari',
        chassis: 'SF21',
        driverGroups: [],
      },
      {
        id: '2021-mclaren',
        year: 2021,
        team: 'McLaren',
        chassis: 'MCL35M',
        driverGroups: [],
      },
      {
        id: '2021-astonmartin',
        year: 2021,
        team: 'Aston Martin',
        chassis: 'AMR21',
        driverGroups: [],
      },
      {
        id: '2021-alpine',
        year: 2021,
        team: 'Alpine',
        chassis: 'A521',
        driverGroups: [],
      },
      {
        id: '2021-alphatauri',
        year: 2021,
        team: 'AlphaTauri',
        chassis: 'AT02',
        driverGroups: [],
      },
      {
        id: '2021-alfaromeo',
        year: 2021,
        team: 'Alfa Romeo',
        chassis: 'C41',
        driverGroups: [],
      },
      {
        id: '2021-haas',
        year: 2021,
        team: 'Haas',
        chassis: 'VF-21',
        driverGroups: [],
      },
      {
        id: '2021-williams',
        year: 2021,
        team: 'Williams',
        chassis: 'FW43B',
        driverGroups: [],
      },

      // === 2020 SEASON ===
      {
        id: '2020-mercedes',
        year: 2020,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W11',
        driverGroups: [],
      },
      {
        id: '2020-redbull',
        year: 2020,
        team: 'Red Bull Racing',
        chassis: 'RB16',
        driverGroups: [],
      },
      {
        id: '2020-ferrari',
        year: 2020,
        team: 'Ferrari',
        chassis: 'SF1000',
        driverGroups: [],
      },
      {
        id: '2020-mclaren',
        year: 2020,
        team: 'McLaren',
        chassis: 'MCL35',
        driverGroups: [],
      },
      {
        id: '2020-renault',
        year: 2020,
        team: 'Renault',
        chassis: 'R.S.20',
        driverGroups: [],
      },
      {
        id: '2020-racingpoint',
        year: 2020,
        team: 'Racing Point',
        chassis: 'RP20',
        driverGroups: [],
      },
      {
        id: '2020-alphatauri',
        year: 2020,
        team: 'AlphaTauri',
        chassis: 'AT01',
        driverGroups: [],
      },
      {
        id: '2020-alfaromeo',
        year: 2020,
        team: 'Alfa Romeo',
        chassis: 'C39',
        driverGroups: [],
      },
      {
        id: '2020-haas',
        year: 2020,
        team: 'Haas',
        chassis: 'VF-20',
        driverGroups: [],
      },
      {
        id: '2020-williams',
        year: 2020,
        team: 'Williams',
        chassis: 'FW43',
        driverGroups: [],
      },

      // === 2019 SEASON ===
      {
        id: '2019-mercedes',
        year: 2019,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W10',
        driverGroups: [],
      },
      {
        id: '2019-ferrari',
        year: 2019,
        team: 'Ferrari',
        chassis: 'SF90',
        driverGroups: [],
      },
      {
        id: '2019-redbull',
        year: 2019,
        team: 'Red Bull Racing',
        chassis: 'RB15',
        driverGroups: [],
      },
      {
        id: '2019-mclaren',
        year: 2019,
        team: 'McLaren',
        chassis: 'MCL34',
        driverGroups: [],
      },
      {
        id: '2019-renault',
        year: 2019,
        team: 'Renault',
        chassis: 'R.S.19',
        driverGroups: [],
      },
      {
        id: '2019-tororosso',
        year: 2019,
        team: 'Toro Rosso',
        chassis: 'STR14',
        driverGroups: [],
      },
      {
        id: '2019-racingpoint',
        year: 2019,
        team: 'Racing Point',
        chassis: 'RP19',
        driverGroups: [],
      },
      {
        id: '2019-alfaromeo',
        year: 2019,
        team: 'Alfa Romeo',
        chassis: 'C38',
        driverGroups: [],
      },
      {
        id: '2019-haas',
        year: 2019,
        team: 'Haas',
        chassis: 'VF-19',
        driverGroups: [],
      },
      {
        id: '2019-williams',
        year: 2019,
        team: 'Williams',
        chassis: 'FW42',
        driverGroups: [],
      },

      // === 2018 SEASON ===
      {
        id: '2018-mercedes',
        year: 2018,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W09',
        driverGroups: [],
      },
      {
        id: '2018-ferrari',
        year: 2018,
        team: 'Ferrari',
        chassis: 'SF71H',
        driverGroups: [],
      },
      {
        id: '2018-redbull',
        year: 2018,
        team: 'Red Bull Racing',
        chassis: 'RB14',
        driverGroups: [],
      },
      {
        id: '2018-renault',
        year: 2018,
        team: 'Renault',
        chassis: 'R.S.18',
        driverGroups: [],
      },
      {
        id: '2018-haas',
        year: 2018,
        team: 'Haas',
        chassis: 'VF-18',
        driverGroups: [],
      },
      {
        id: '2018-mclaren',
        year: 2018,
        team: 'McLaren',
        chassis: 'MCL33',
        driverGroups: [],
      },
      {
        id: '2018-forceindia',
        year: 2018,
        team: 'Force India',
        chassis: 'VJM11',
        driverGroups: [],
      },
      {
        id: '2018-sauber',
        year: 2018,
        team: 'Sauber',
        chassis: 'C37',
        driverGroups: [],
      },
      {
        id: '2018-tororosso',
        year: 2018,
        team: 'Toro Rosso',
        chassis: 'STR13',
        driverGroups: [],
      },
      {
        id: '2018-williams',
        year: 2018,
        team: 'Williams',
        chassis: 'FW41',
        driverGroups: [],
      },

      // === 2017 SEASON ===
      {
        id: '2017-mercedes',
        year: 2017,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W08',
        driverGroups: [],
      },
      {
        id: '2017-ferrari',
        year: 2017,
        team: 'Ferrari',
        chassis: 'SF70H',
        driverGroups: [],
      },
      {
        id: '2017-redbull',
        year: 2017,
        team: 'Red Bull Racing',
        chassis: 'RB13',
        driverGroups: [],
      },
      {
        id: '2017-forceindia',
        year: 2017,
        team: 'Force India',
        chassis: 'VJM10',
        driverGroups: [],
      },
      {
        id: '2017-williams',
        year: 2017,
        team: 'Williams',
        chassis: 'FW40',
        driverGroups: [],
      },
      {
        id: '2017-mclaren',
        year: 2017,
        team: 'McLaren',
        chassis: 'MCL32',
        driverGroups: [],
      },
      {
        id: '2017-tororosso',
        year: 2017,
        team: 'Toro Rosso',
        chassis: 'STR12',
        driverGroups: [],
      },
      {
        id: '2017-haas',
        year: 2017,
        team: 'Haas',
        chassis: 'VF-17',
        driverGroups: [],
      },
      {
        id: '2017-renault',
        year: 2017,
        team: 'Renault',
        chassis: 'R.S.17',
        driverGroups: [],
      },
      {
        id: '2017-sauber',
        year: 2017,
        team: 'Sauber',
        chassis: 'C36',
        driverGroups: [],
      },

      // === 2016 SEASON ===
      {
        id: '2016-mercedes',
        year: 2016,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W07',
        driverGroups: [],
      },
      {
        id: '2016-ferrari',
        year: 2016,
        team: 'Ferrari',
        chassis: 'SF16-H',
        driverGroups: [],
      },
      {
        id: '2016-redbull',
        year: 2016,
        team: 'Red Bull Racing',
        chassis: 'RB12',
        driverGroups: [],
      },
      {
        id: '2016-williams',
        year: 2016,
        team: 'Williams',
        chassis: 'FW38',
        driverGroups: [],
      },
      {
        id: '2016-forceindia',
        year: 2016,
        team: 'Force India',
        chassis: 'VJM09',
        driverGroups: [],
      },
      {
        id: '2016-mclaren',
        year: 2016,
        team: 'McLaren',
        chassis: 'MP4-31',
        driverGroups: [],
      },
      {
        id: '2016-tororosso',
        year: 2016,
        team: 'Toro Rosso',
        chassis: 'STR11',
        driverGroups: [],
      },
      {
        id: '2016-haas',
        year: 2016,
        team: 'Haas',
        chassis: 'VF-16',
        driverGroups: [],
      },
      {
        id: '2016-renault',
        year: 2016,
        team: 'Renault',
        chassis: 'R.S.16',
        driverGroups: [],
      },
      {
        id: '2016-sauber',
        year: 2016,
        team: 'Sauber',
        chassis: 'C35',
        driverGroups: [],
      },
      {
        id: '2016-manor',
        year: 2016,
        team: 'Manor',
        chassis: 'MRT05',
        driverGroups: [],
      },

      // === 2015 SEASON ===
      {
        id: '2015-mercedes',
        year: 2015,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W06',
        driverGroups: [],
      },
      {
        id: '2015-ferrari',
        year: 2015,
        team: 'Ferrari',
        chassis: 'SF15-T',
        driverGroups: [],
      },
      {
        id: '2015-williams',
        year: 2015,
        team: 'Williams',
        chassis: 'FW37',
        driverGroups: [],
      },
      {
        id: '2015-redbull',
        year: 2015,
        team: 'Red Bull Racing',
        chassis: 'RB11',
        driverGroups: [],
      },
      {
        id: '2015-forceindia',
        year: 2015,
        team: 'Force India',
        chassis: 'VJM08',
        driverGroups: [],
      },
      {
        id: '2015-lotus',
        year: 2015,
        team: 'Lotus',
        chassis: 'E23',
        driverGroups: [],
      },
      {
        id: '2015-tororosso',
        year: 2015,
        team: 'Toro Rosso',
        chassis: 'STR10',
        driverGroups: [],
      },
      {
        id: '2015-sauber',
        year: 2015,
        team: 'Sauber',
        chassis: 'C34',
        driverGroups: [],
      },
      {
        id: '2015-mclaren',
        year: 2015,
        team: 'McLaren',
        chassis: 'MP4-30',
        driverGroups: [],
      },
      {
        id: '2015-manor',
        year: 2015,
        team: 'Manor',
        chassis: 'MR03B',
        driverGroups: [],
      },

      // === 2014 SEASON ===
      {
        id: '2014-mercedes',
        year: 2014,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W05',
        driverGroups: [],
      },
      {
        id: '2014-redbull',
        year: 2014,
        team: 'Red Bull Racing',
        chassis: 'RB10',
        driverGroups: [],
      },
      {
        id: '2014-ferrari',
        year: 2014,
        team: 'Ferrari',
        chassis: 'F14 T',
        driverGroups: [],
      },
      {
        id: '2014-williams',
        year: 2014,
        team: 'Williams',
        chassis: 'FW36',
        driverGroups: [],
      },
      {
        id: '2014-mclaren',
        year: 2014,
        team: 'McLaren',
        chassis: 'MP4-29',
        driverGroups: [],
      },
      {
        id: '2014-forceindia',
        year: 2014,
        team: 'Force India',
        chassis: 'VJM07',
        driverGroups: [],
      },
      {
        id: '2014-tororosso',
        year: 2014,
        team: 'Toro Rosso',
        chassis: 'STR9',
        driverGroups: [],
      },
      {
        id: '2014-lotus',
        year: 2014,
        team: 'Lotus',
        chassis: 'E22',
        driverGroups: [],
      },
      {
        id: '2014-sauber',
        year: 2014,
        team: 'Sauber',
        chassis: 'C33',
        driverGroups: [],
      },
      {
        id: '2014-marussia',
        year: 2014,
        team: 'Marussia',
        chassis: 'MR03',
        driverGroups: [],
      },
      {
        id: '2014-caterham',
        year: 2014,
        team: 'Caterham',
        chassis: 'CT05',
        driverGroups: [],
      },

      // === 2013 SEASON ===
      {
        id: '2013-redbull',
        year: 2013,
        team: 'Red Bull Racing',
        chassis: 'RB9',
        driverGroups: [],
      },
      {
        id: '2013-ferrari',
        year: 2013,
        team: 'Ferrari',
        chassis: 'F138',
        driverGroups: [],
      },
      {
        id: '2013-mercedes',
        year: 2013,
        team: 'Mercedes-AMG Petronas',
        chassis: 'W04',
        driverGroups: [],
      },
      {
        id: '2013-lotus',
        year: 2013,
        team: 'Lotus',
        chassis: 'E21',
        driverGroups: [],
      },
      {
        id: '2013-mclaren',
        year: 2013,
        team: 'McLaren',
        chassis: 'MP4-28',
        driverGroups: [],
      },
      {
        id: '2013-forceindia',
        year: 2013,
        team: 'Force India',
        chassis: 'VJM06',
        driverGroups: [],
      },
      {
        id: '2013-sauber',
        year: 2013,
        team: 'Sauber',
        chassis: 'C32',
        driverGroups: [],
      },
      {
        id: '2013-tororosso',
        year: 2013,
        team: 'Toro Rosso',
        chassis: 'STR8',
        driverGroups: [],
      },
      {
        id: '2013-williams',
        year: 2013,
        team: 'Williams',
        chassis: 'FW35',
        driverGroups: [],
      },
      {
        id: '2013-marussia',
        year: 2013,
        team: 'Marussia',
        chassis: 'MR02',
        driverGroups: [],
      },
      {
        id: '2013-caterham',
        year: 2013,
        team: 'Caterham',
        chassis: 'CT03',
        driverGroups: [],
      },

      // === 2012 SEASON ===
      {
        id: '2012-redbull',
        year: 2012,
        team: 'Red Bull Racing',
        chassis: 'RB8',
        driverGroups: [],
      },
      {
        id: '2012-mclaren',
        year: 2012,
        team: 'McLaren',
        chassis: 'MP4-27',
        driverGroups: [],
      },
      {
        id: '2012-ferrari',
        year: 2012,
        team: 'Ferrari',
        chassis: 'F2012',
        driverGroups: [],
      },
      {
        id: '2012-lotus',
        year: 2012,
        team: 'Lotus',
        chassis: 'E20',
        driverGroups: [],
      },
      {
        id: '2012-mercedes',
        year: 2012,
        team: 'Mercedes',
        chassis: 'W03',
        driverGroups: [],
      },
      {
        id: '2012-sauber',
        year: 2012,
        team: 'Sauber',
        chassis: 'C31',
        driverGroups: [],
      },
      {
        id: '2012-forceindia',
        year: 2012,
        team: 'Force India',
        chassis: 'VJM05',
        driverGroups: [],
      },
      {
        id: '2012-williams',
        year: 2012,
        team: 'Williams',
        chassis: 'FW34',
        driverGroups: [],
      },
      {
        id: '2012-tororosso',
        year: 2012,
        team: 'Toro Rosso',
        chassis: 'STR7',
        driverGroups: [],
      },
      {
        id: '2012-caterham',
        year: 2012,
        team: 'Caterham',
        chassis: 'CT01',
        driverGroups: [],
      },
      {
        id: '2012-marussia',
        year: 2012,
        team: 'Marussia',
        chassis: 'MR01',
        driverGroups: [],
      },
      {
        id: '2012-hrt',
        year: 2012,
        team: 'HRT',
        chassis: 'F112',
        driverGroups: [],
      },

      // === 2011 SEASON ===
      {
        id: '2011-redbull',
        year: 2011,
        team: 'Red Bull Racing',
        chassis: 'RB7',
        driverGroups: [],
      },
      {
        id: '2011-mclaren',
        year: 2011,
        team: 'McLaren',
        chassis: 'MP4-26',
        driverGroups: [],
      },
      {
        id: '2011-ferrari',
        year: 2011,
        team: 'Ferrari',
        chassis: '150° Italia',
        driverGroups: [],
      },
      {
        id: '2011-mercedes',
        year: 2011,
        team: 'Mercedes',
        chassis: 'W02',
        driverGroups: [],
      },
      {
        id: '2011-renault',
        year: 2011,
        team: 'Renault',
        chassis: 'R31',
        driverGroups: [],
      },
      {
        id: '2011-sauber',
        year: 2011,
        team: 'Sauber',
        chassis: 'C30',
        driverGroups: [],
      },
      {
        id: '2011-forceindia',
        year: 2011,
        team: 'Force India',
        chassis: 'VJM04',
        driverGroups: [],
      },
      {
        id: '2011-tororosso',
        year: 2011,
        team: 'Toro Rosso',
        chassis: 'STR6',
        driverGroups: [],
      },
      {
        id: '2011-williams',
        year: 2011,
        team: 'Williams',
        chassis: 'FW33',
        driverGroups: [],
      },
      {
        id: '2011-hrt',
        year: 2011,
        team: 'HRT',
        chassis: 'F111',
        driverGroups: [],
      },
      {
        id: '2011-lotus',
        year: 2011,
        team: 'Team Lotus',
        chassis: 'T128',
        driverGroups: [],
      },
      {
        id: '2011-virgin',
        year: 2011,
        team: 'Virgin Racing',
        chassis: 'MVR-02',
        driverGroups: [],
      },

      // === 2010 SEASON ===
      {
        id: '2010-redbull',
        year: 2010,
        team: 'Red Bull Racing',
        chassis: 'RB6',
        driverGroups: [],
      },
      {
        id: '2010-mclaren',
        year: 2010,
        team: 'McLaren',
        chassis: 'MP4-25',
        driverGroups: [],
      },
      {
        id: '2010-ferrari',
        year: 2010,
        team: 'Ferrari',
        chassis: 'F10',
        driverGroups: [],
      },
      {
        id: '2010-mercedes',
        year: 2010,
        team: 'Mercedes',
        chassis: 'W01',
        driverGroups: [],
      },
      {
        id: '2010-renault',
        year: 2010,
        team: 'Renault',
        chassis: 'R30',
        driverGroups: [],
      },
      {
        id: '2010-williams',
        year: 2010,
        team: 'Williams',
        chassis: 'FW32',
        driverGroups: [],
      },
      {
        id: '2010-forceindia',
        year: 2010,
        team: 'Force India',
        chassis: 'VJM03',
        driverGroups: [],
      },
      {
        id: '2010-sauber',
        year: 2010,
        team: 'Sauber',
        chassis: 'C29',
        driverGroups: [],
      },
      {
        id: '2010-tororosso',
        year: 2010,
        team: 'Toro Rosso',
        chassis: 'STR5',
        driverGroups: [],
      },
      {
        id: '2010-lotus',
        year: 2010,
        team: 'Lotus Racing',
        chassis: 'T127',
        driverGroups: [],
      },
      {
        id: '2010-hrt',
        year: 2010,
        team: 'HRT',
        chassis: 'F110',
        driverGroups: [],
      },
      {
        id: '2010-virgin',
        year: 2010,
        team: 'Virgin Racing',
        chassis: 'VR-01',
        driverGroups: [],
      },

      // === 2009 SEASON ===
      {
        id: '2009-brawn',
        year: 2009,
        team: 'Brawn GP',
        chassis: 'BGP 001',
        driverGroups: [],
      },
      {
        id: '2009-redbull',
        year: 2009,
        team: 'Red Bull Racing',
        chassis: 'RB5',
        driverGroups: [],
      },
      {
        id: '2009-mclaren',
        year: 2009,
        team: 'McLaren',
        chassis: 'MP4-24',
        driverGroups: [],
      },
      {
        id: '2009-ferrari',
        year: 2009,
        team: 'Ferrari',
        chassis: 'F60',
        driverGroups: [],
      },
      {
        id: '2009-toyota',
        year: 2009,
        team: 'Toyota',
        chassis: 'TF109',
        driverGroups: [],
      },
      {
        id: '2009-bmw',
        year: 2009,
        team: 'BMW Sauber',
        chassis: 'F1.09',
        driverGroups: [],
      },
      {
        id: '2009-williams',
        year: 2009,
        team: 'Williams',
        chassis: 'FW31',
        driverGroups: [],
      },
      {
        id: '2009-renault',
        year: 2009,
        team: 'Renault',
        chassis: 'R29',
        driverGroups: [],
      },
      {
        id: '2009-tororosso',
        year: 2009,
        team: 'Toro Rosso',
        chassis: 'STR4',
        driverGroups: [],
      },
      {
        id: '2009-forceindia',
        year: 2009,
        team: 'Force India',
        chassis: 'VJM02',
        driverGroups: [],
      },

      // === 2008 SEASON ===
      {
        id: '2008-mclaren',
        year: 2008,
        team: 'McLaren',
        chassis: 'MP4-23',
        driverGroups: [],
      },
      {
        id: '2008-ferrari',
        year: 2008,
        team: 'Ferrari',
        chassis: 'F2008',
        driverGroups: [],
      },
      {
        id: '2008-bmw',
        year: 2008,
        team: 'BMW Sauber',
        chassis: 'F1.08',
        driverGroups: [],
      },
      {
        id: '2008-renault',
        year: 2008,
        team: 'Renault',
        chassis: 'R28',
        driverGroups: [],
      },
      {
        id: '2008-toyota',
        year: 2008,
        team: 'Toyota',
        chassis: 'TF108',
        driverGroups: [],
      },
      {
        id: '2008-tororosso',
        year: 2008,
        team: 'Toro Rosso',
        chassis: 'STR3',
        driverGroups: [],
      },
      {
        id: '2008-redbull',
        year: 2008,
        team: 'Red Bull Racing',
        chassis: 'RB4',
        driverGroups: [],
      },
      {
        id: '2008-williams',
        year: 2008,
        team: 'Williams',
        chassis: 'FW30',
        driverGroups: [],
      },
      {
        id: '2008-honda',
        year: 2008,
        team: 'Honda',
        chassis: 'RA108',
        driverGroups: [],
      },
      {
        id: '2008-forceindia',
        year: 2008,
        team: 'Force India',
        chassis: 'VJM01',
        driverGroups: [],
      },
      {
        id: '2008-superaguri',
        year: 2008,
        team: 'Super Aguri',
        chassis: 'SA08',
        driverGroups: [],
      },

      // === 2007 SEASON ===
      {
        id: '2007-ferrari',
        year: 2007,
        team: 'Ferrari',
        chassis: 'F2007',
        driverGroups: [],
      },
      {
        id: '2007-mclaren',
        year: 2007,
        team: 'McLaren',
        chassis: 'MP4-22',
        driverGroups: [],
      },
      {
        id: '2007-bmw',
        year: 2007,
        team: 'BMW Sauber',
        chassis: 'F1.07',
        driverGroups: [],
      },
      {
        id: '2007-renault',
        year: 2007,
        team: 'Renault',
        chassis: 'R27',
        driverGroups: [],
      },
      {
        id: '2007-williams',
        year: 2007,
        team: 'Williams',
        chassis: 'FW29',
        driverGroups: [],
      },
      {
        id: '2007-toyota',
        year: 2007,
        team: 'Toyota',
        chassis: 'TF107',
        driverGroups: [],
      },
      {
        id: '2007-redbull',
        year: 2007,
        team: 'Red Bull Racing',
        chassis: 'RB3',
        driverGroups: [],
      },
      {
        id: '2007-tororosso',
        year: 2007,
        team: 'Toro Rosso',
        chassis: 'STR2',
        driverGroups: [],
      },
      {
        id: '2007-honda',
        year: 2007,
        team: 'Honda',
        chassis: 'RA107',
        driverGroups: [],
      },
      {
        id: '2007-superaguri',
        year: 2007,
        team: 'Super Aguri',
        chassis: 'SA07',
        driverGroups: [],
      },
      {
        id: '2007-spyker',
        year: 2007,
        team: 'Spyker',
        chassis: 'F8-VII',
        driverGroups: [],
      },

      // === 2006 SEASON ===
      {
        id: '2006-renault',
        year: 2006,
        team: 'Renault',
        chassis: 'R26',
        driverGroups: [],
      },
      {
        id: '2006-ferrari',
        year: 2006,
        team: 'Ferrari',
        chassis: '248 F1',
        driverGroups: [],
      },
      {
        id: '2006-mclaren',
        year: 2006,
        team: 'McLaren',
        chassis: 'MP4-21',
        driverGroups: [],
      },
      {
        id: '2006-honda',
        year: 2006,
        team: 'Honda',
        chassis: 'RA106',
        driverGroups: [],
      },
      {
        id: '2006-bmw',
        year: 2006,
        team: 'BMW Sauber',
        chassis: 'F1.06',
        driverGroups: [],
      },
      {
        id: '2006-toyota',
        year: 2006,
        team: 'Toyota',
        chassis: 'TF106',
        driverGroups: [],
      },
      {
        id: '2006-williams',
        year: 2006,
        team: 'Williams',
        chassis: 'FW28',
        driverGroups: [],
      },
      {
        id: '2006-redbull',
        year: 2006,
        team: 'Red Bull Racing',
        chassis: 'RB2',
        driverGroups: [],
      },
      {
        id: '2006-tororosso',
        year: 2006,
        team: 'Toro Rosso',
        chassis: 'STR1',
        driverGroups: [],
      },
      {
        id: '2006-midland',
        year: 2006,
        team: 'Midland F1',
        chassis: 'M16',
        driverGroups: [],
      },
      {
        id: '2006-superaguri',
        year: 2006,
        team: 'Super Aguri',
        chassis: 'SA05',
        driverGroups: [],
      },

      // === 2005 SEASON ===
      {
        id: '2005-renault',
        year: 2005,
        team: 'Renault',
        chassis: 'R25',
        driverGroups: [],
      },
      {
        id: '2005-mclaren',
        year: 2005,
        team: 'McLaren',
        chassis: 'MP4-20',
        driverGroups: [],
      },
      {
        id: '2005-ferrari',
        year: 2005,
        team: 'Ferrari',
        chassis: 'F2005',
        driverGroups: [],
      },
      {
        id: '2005-toyota',
        year: 2005,
        team: 'Toyota',
        chassis: 'TF105',
        driverGroups: [],
      },
      {
        id: '2005-williams',
        year: 2005,
        team: 'Williams',
        chassis: 'FW27',
        driverGroups: [],
      },
      {
        id: '2005-bmw',
        year: 2005,
        team: 'Sauber',
        chassis: 'C24',
        driverGroups: [],
      },
      {
        id: '2005-redbull',
        year: 2005,
        team: 'Red Bull Racing',
        chassis: 'RB1',
        driverGroups: [],
      },
      {
        id: '2005-barchetta',
        year: 2005,
        team: 'BAR',
        chassis: '007',
        driverGroups: [],
      },
      {
        id: '2005-jordan',
        year: 2005,
        team: 'Jordan',
        chassis: 'EJ15',
        driverGroups: [],
      },
      {
        id: '2005-minardi',
        year: 2005,
        team: 'Minardi',
        chassis: 'PS05',
        driverGroups: [],
      },

      // === 2004 SEASON ===
      {
        id: '2004-ferrari',
        year: 2004,
        team: 'Ferrari',
        chassis: 'F2004',
        driverGroups: [],
      },
      {
        id: '2004-bar',
        year: 2004,
        team: 'BAR',
        chassis: '006',
        driverGroups: [],
      },
      {
        id: '2004-renault',
        year: 2004,
        team: 'Renault',
        chassis: 'R24',
        driverGroups: [],
      },
      {
        id: '2004-williams',
        year: 2004,
        team: 'Williams',
        chassis: 'FW26',
        driverGroups: [],
      },
      {
        id: '2004-mclaren',
        year: 2004,
        team: 'McLaren',
        chassis: 'MP4-19',
        driverGroups: [],
      },
      {
        id: '2004-sauber',
        year: 2004,
        team: 'Sauber',
        chassis: 'C23',
        driverGroups: [],
      },
      {
        id: '2004-jaguar',
        year: 2004,
        team: 'Jaguar',
        chassis: 'R5',
        driverGroups: [],
      },
      {
        id: '2004-toyota',
        year: 2004,
        team: 'Toyota',
        chassis: 'TF104',
        driverGroups: [],
      },
      {
        id: '2004-jordan',
        year: 2004,
        team: 'Jordan',
        chassis: 'EJ14',
        driverGroups: [],
      },
      {
        id: '2004-minardi',
        year: 2004,
        team: 'Minardi',
        chassis: 'PS04',
        driverGroups: [],
      },

      // === 2003 SEASON ===
      {
        id: '2003-ferrari',
        year: 2003,
        team: 'Ferrari',
        chassis: 'F2003-GA',
        driverGroups: [],
      },
      {
        id: '2003-williams',
        year: 2003,
        team: 'Williams',
        chassis: 'FW25',
        driverGroups: [],
      },
      {
        id: '2003-mclaren',
        year: 2003,
        team: 'McLaren',
        chassis: 'MP4-17D',
        driverGroups: [],
      },
      {
        id: '2003-renault',
        year: 2003,
        team: 'Renault',
        chassis: 'R23',
        driverGroups: [],
      },
      {
        id: '2003-sauber',
        year: 2003,
        team: 'Sauber',
        chassis: 'C22',
        driverGroups: [],
      },
      {
        id: '2003-jaguar',
        year: 2003,
        team: 'Jaguar',
        chassis: 'R4',
        driverGroups: [],
      },
      {
        id: '2003-toyota',
        year: 2003,
        team: 'Toyota',
        chassis: 'TF103',
        driverGroups: [],
      },
      {
        id: '2003-jordan',
        year: 2003,
        team: 'Jordan',
        chassis: 'EJ13',
        driverGroups: [],
      },
      {
        id: '2003-bar',
        year: 2003,
        team: 'BAR',
        chassis: '005',
        driverGroups: [],
      },
      {
        id: '2003-minardi',
        year: 2003,
        team: 'Minardi',
        chassis: 'PS03',
        driverGroups: [],
      },

      // === 2002 SEASON ===
      {
        id: '2002-ferrari',
        year: 2002,
        team: 'Ferrari',
        chassis: 'F2002',
        driverGroups: [],
      },
      {
        id: '2002-williams',
        year: 2002,
        team: 'Williams',
        chassis: 'FW24',
        driverGroups: [],
      },
      {
        id: '2002-mclaren',
        year: 2002,
        team: 'McLaren',
        chassis: 'MP4-17',
        driverGroups: [],
      },
      {
        id: '2002-renault',
        year: 2002,
        team: 'Renault',
        chassis: 'R202',
        driverGroups: [],
      },
      {
        id: '2002-sauber',
        year: 2002,
        team: 'Sauber',
        chassis: 'C21',
        driverGroups: [],
      },
      {
        id: '2002-jordan',
        year: 2002,
        team: 'Jordan',
        chassis: 'EJ12',
        driverGroups: [],
      },
      {
        id: '2002-bar',
        year: 2002,
        team: 'BAR',
        chassis: '004',
        driverGroups: [],
      },
      {
        id: '2002-jaguar',
        year: 2002,
        team: 'Jaguar',
        chassis: 'R3',
        driverGroups: [],
      },
      {
        id: '2002-toyota',
        year: 2002,
        team: 'Toyota',
        chassis: 'TF102',
        driverGroups: [],
      },
      {
        id: '2002-minardi',
        year: 2002,
        team: 'Minardi',
        chassis: 'PS02',
        driverGroups: [],
      },
      {
        id: '2002-arrows',
        year: 2002,
        team: 'Arrows',
        chassis: 'A23',
        driverGroups: [],
      },

      // === 2001 SEASON ===
      {
        id: '2001-ferrari',
        year: 2001,
        team: 'Ferrari',
        chassis: 'F2001',
        driverGroups: [],
      },
      {
        id: '2001-mclaren',
        year: 2001,
        team: 'McLaren',
        chassis: 'MP4-16',
        driverGroups: [],
      },
      {
        id: '2001-williams',
        year: 2001,
        team: 'Williams',
        chassis: 'FW23',
        driverGroups: [],
      },
      {
        id: '2001-sauber',
        year: 2001,
        team: 'Sauber',
        chassis: 'C20',
        driverGroups: [],
      },
      {
        id: '2001-jordan',
        year: 2001,
        team: 'Jordan',
        chassis: 'EJ11',
        driverGroups: [],
      },
      {
        id: '2001-bar',
        year: 2001,
        team: 'BAR',
        chassis: '003',
        driverGroups: [],
      },
      {
        id: '2001-benetton',
        year: 2001,
        team: 'Benetton',
        chassis: 'B201',
        driverGroups: [],
      },
      {
        id: '2001-jaguar',
        year: 2001,
        team: 'Jaguar',
        chassis: 'R2',
        driverGroups: [],
      },
      {
        id: '2001-prost',
        year: 2001,
        team: 'Prost',
        chassis: 'AP04',
        driverGroups: [],
      },
      {
        id: '2001-arrows',
        year: 2001,
        team: 'Arrows',
        chassis: 'A22',
        driverGroups: [],
      },
      {
        id: '2001-minardi',
        year: 2001,
        team: 'Minardi',
        chassis: 'PS01',
        driverGroups: [],
      },

      // === 2000 SEASON ===
      {
        id: '2000-ferrari',
        year: 2000,
        team: 'Ferrari',
        chassis: 'F1-2000',
        driverGroups: [],
      },
      {
        id: '2000-mclaren',
        year: 2000,
        team: 'McLaren',
        chassis: 'MP4-15',
        driverGroups: [],
      },
      {
        id: '2000-williams',
        year: 2000,
        team: 'Williams',
        chassis: 'FW22',
        driverGroups: [],
      },
      {
        id: '2000-benetton',
        year: 2000,
        team: 'Benetton',
        chassis: 'B200',
        driverGroups: [],
      },
      {
        id: '2000-jordan',
        year: 2000,
        team: 'Jordan',
        chassis: 'EJ10',
        driverGroups: [],
      },
      {
        id: '2000-bar',
        year: 2000,
        team: 'BAR',
        chassis: '002',
        driverGroups: [],
      },
      {
        id: '2000-arrows',
        year: 2000,
        team: 'Arrows',
        chassis: 'A21',
        driverGroups: [],
      },
      {
        id: '2000-sauber',
        year: 2000,
        team: 'Sauber',
        chassis: 'C19',
        driverGroups: [],
      },
      {
        id: '2000-jaguar',
        year: 2000,
        team: 'Jaguar',
        chassis: 'R1',
        driverGroups: [],
      },
      {
        id: '2000-minardi',
        year: 2000,
        team: 'Minardi',
        chassis: 'M02',
        driverGroups: [],
      },
      {
        id: '2000-prost',
        year: 2000,
        team: 'Prost',
        chassis: 'AP03',
        driverGroups: [],
      },

      // === 1999 SEASON ===
      {
        id: '1999-ferrari',
        year: 1999,
        team: 'Ferrari',
        chassis: 'F399',
        driverGroups: [],
      },
      {
        id: '1999-mclaren',
        year: 1999,
        team: 'McLaren',
        chassis: 'MP4/14',
        driverGroups: [],
      },
      {
        id: '1999-jordan',
        year: 1999,
        team: 'Jordan',
        chassis: '199',
        driverGroups: [],
      },
      {
        id: '1999-williams',
        year: 1999,
        team: 'Williams',
        chassis: 'FW21',
        driverGroups: [],
      },
      {
        id: '1999-benetton',
        year: 1999,
        team: 'Benetton',
        chassis: 'B199',
        driverGroups: [],
      },
      {
        id: '1999-stewart',
        year: 1999,
        team: 'Stewart',
        chassis: 'SF3',
        driverGroups: [],
      },
      {
        id: '1999-prost',
        year: 1999,
        team: 'Prost',
        chassis: 'AP02',
        driverGroups: [],
      },
      {
        id: '1999-sauber',
        year: 1999,
        team: 'Sauber',
        chassis: 'C18',
        driverGroups: [],
      },
      {
        id: '1999-arrows',
        year: 1999,
        team: 'Arrows',
        chassis: 'A20',
        driverGroups: [],
      },
      {
        id: '1999-minardi',
        year: 1999,
        team: 'Minardi',
        chassis: 'M01',
        driverGroups: [],
      },
      {
        id: '1999-bar',
        year: 1999,
        team: 'BAR',
        chassis: '01',
        driverGroups: [],
      },

      // === 1998 SEASON ===
      {
        id: '1998-mclaren',
        year: 1998,
        team: 'McLaren',
        chassis: 'MP4/13',
        driverGroups: [],
      },
      {
        id: '1998-ferrari',
        year: 1998,
        team: 'Ferrari',
        chassis: 'F300',
        driverGroups: [],
      },
      {
        id: '1998-williams',
        year: 1998,
        team: 'Williams',
        chassis: 'FW20',
        driverGroups: [],
      },
      {
        id: '1998-jordan',
        year: 1998,
        team: 'Jordan',
        chassis: '198',
        driverGroups: [],
      },
      {
        id: '1998-benetton',
        year: 1998,
        team: 'Benetton',
        chassis: 'B198',
        driverGroups: [],
      },
      {
        id: '1998-sauber',
        year: 1998,
        team: 'Sauber',
        chassis: 'C17',
        driverGroups: [],
      },
      {
        id: '1998-arrows',
        year: 1998,
        team: 'Arrows',
        chassis: 'A19',
        driverGroups: [],
      },
      {
        id: '1998-stewart',
        year: 1998,
        team: 'Stewart',
        chassis: 'SF02',
        driverGroups: [],
      },
      {
        id: '1998-prost',
        year: 1998,
        team: 'Prost',
        chassis: 'AP01',
        driverGroups: [],
      },
      {
        id: '1998-tyrrell',
        year: 1998,
        team: 'Tyrrell',
        chassis: '026',
        driverGroups: [],
      },
      {
        id: '1998-minardi',
        year: 1998,
        team: 'Minardi',
        chassis: 'M198',
        driverGroups: [],
      },

      // === 1997 SEASON ===
      {
        id: '1997-williams',
        year: 1997,
        team: 'Williams',
        chassis: 'FW19',
        driverGroups: [],
      },
      {
        id: '1997-ferrari',
        year: 1997,
        team: 'Ferrari',
        chassis: 'F310B',
        driverGroups: [],
      },
      {
        id: '1997-benetton',
        year: 1997,
        team: 'Benetton',
        chassis: 'B197',
        driverGroups: [],
      },
      {
        id: '1997-mclaren',
        year: 1997,
        team: 'McLaren',
        chassis: 'MP4/12',
        driverGroups: [],
      },
      {
        id: '1997-jordan',
        year: 1997,
        team: 'Jordan',
        chassis: '197',
        driverGroups: [],
      },
      {
        id: '1997-prost',
        year: 1997,
        team: 'Prost',
        chassis: 'JS45',
        driverGroups: [],
      },
      {
        id: '1997-sauber',
        year: 1997,
        team: 'Sauber',
        chassis: 'C16',
        driverGroups: [],
      },
      {
        id: '1997-arrows',
        year: 1997,
        team: 'Arrows',
        chassis: 'A18',
        driverGroups: [],
      },
      {
        id: '1997-stewart',
        year: 1997,
        team: 'Stewart',
        chassis: 'SF01',
        driverGroups: [],
      },
      {
        id: '1997-tyrrell',
        year: 1997,
        team: 'Tyrrell',
        chassis: '025',
        driverGroups: [],
      },
      {
        id: '1997-minardi',
        year: 1997,
        team: 'Minardi',
        chassis: 'M197',
        driverGroups: [],
      },
      {
        id: '1997-lola',
        year: 1997,
        team: 'Lola',
        chassis: 'T97/30',
        driverGroups: [],
      },

      // === 1996 SEASON ===
      {
        id: '1996-williams',
        year: 1996,
        team: 'Williams',
        chassis: 'FW18',
        driverGroups: [],
      },
      {
        id: '1996-ferrari',
        year: 1996,
        team: 'Ferrari',
        chassis: 'F310',
        driverGroups: [],
      },
      {
        id: '1996-benetton',
        year: 1996,
        team: 'Benetton',
        chassis: 'B196',
        driverGroups: [],
      },
      {
        id: '1996-mclaren',
        year: 1996,
        team: 'McLaren',
        chassis: 'MP4/11',
        driverGroups: [],
      },
      {
        id: '1996-jordan',
        year: 1996,
        team: 'Jordan',
        chassis: '196',
        driverGroups: [],
      },
      {
        id: '1996-ligier',
        year: 1996,
        team: 'Ligier',
        chassis: 'JS43',
        driverGroups: [],
      },
      {
        id: '1996-sauber',
        year: 1996,
        team: 'Sauber',
        chassis: 'C15',
        driverGroups: [],
      },
      {
        id: '1996-tyrrell',
        year: 1996,
        team: 'Tyrrell',
        chassis: '024',
        driverGroups: [],
      },
      {
        id: '1996-footwork',
        year: 1996,
        team: 'Footwork',
        chassis: 'FA17',
        driverGroups: [],
      },
      {
        id: '1996-minardi',
        year: 1996,
        team: 'Minardi',
        chassis: 'M195B',
        driverGroups: [],
      },
      {
        id: '1996-forti',
        year: 1996,
        team: 'Forti',
        chassis: 'FG03',
        driverGroups: [],
      },

      // === 1995 SEASON ===
      {
        id: '1995-benetton',
        year: 1995,
        team: 'Benetton',
        chassis: 'B195',
        driverGroups: [],
      },
      {
        id: '1995-williams',
        year: 1995,
        team: 'Williams',
        chassis: 'FW17',
        driverGroups: [],
      },
      {
        id: '1995-ferrari',
        year: 1995,
        team: 'Ferrari',
        chassis: '412 T2',
        driverGroups: [],
      },
      {
        id: '1995-mclaren',
        year: 1995,
        team: 'McLaren',
        chassis: 'MP4/10',
        driverGroups: [],
      },
      {
        id: '1995-ligier',
        year: 1995,
        team: 'Ligier',
        chassis: 'JS41',
        driverGroups: [],
      },
      {
        id: '1995-jordan',
        year: 1995,
        team: 'Jordan',
        chassis: '195',
        driverGroups: [],
      },
      {
        id: '1995-sauber',
        year: 1995,
        team: 'Sauber',
        chassis: 'C14',
        driverGroups: [],
      },
      {
        id: '1995-footwork',
        year: 1995,
        team: 'Footwork',
        chassis: 'FA16',
        driverGroups: [],
      },
      {
        id: '1995-tyrrell',
        year: 1995,
        team: 'Tyrrell',
        chassis: '023',
        driverGroups: [],
      },
      {
        id: '1995-minardi',
        year: 1995,
        team: 'Minardi',
        chassis: 'M195',
        driverGroups: [],
      },
      {
        id: '1995-forti',
        year: 1995,
        team: 'Forti',
        chassis: 'FG01',
        driverGroups: [],
      },
      {
        id: '1995-pacific',
        year: 1995,
        team: 'Pacific',
        chassis: 'PR02',
        driverGroups: [],
      },
    ];
    // setF1Cars(mockF1Cars); // Now loading from Supabase instead
  };

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
      // Build weighted search query with most important keywords first
      // Priority: Manufacturer + Scale (required) > Event/Race > Driver/Team > Year > SKU
      const queryParts = [
        model.manufacturer,        // e.g., "Minichamps"
        model.scale,              // e.g., "1:43"
        car.team,                 // e.g., "McLaren"
        model.driver,             // e.g., "Lando Norris"
        model.eventName,          // e.g., "Miami GP 2024" (CRITICAL - this was missing!)
        car.year,                 // e.g., "2024"
        model.sku,                // e.g., "537244404" (exact match filter)
      ].filter(Boolean); // Remove undefined/null values

      const searchQuery = queryParts.join(' ');

      console.log('🔍 eBay search query:', searchQuery);

      // Prepare model info for AI filtering
      const modelInfo = {
        manufacturer: model.manufacturer,
        scale: model.scale,
        team: car.team,
        driver: model.driver,
        eventName: model.eventName || '',
        year: car.year?.toString() || '',
        sku: model.sku || '',
      };

      console.log('🤖 Model info for AI filtering:', modelInfo);

      // Using eBay Browse API with OAuth + Claude Haiku 4.5 AI filtering
      const response = await fetch('/api/admin/search-ebay-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchQuery, modelInfo }),
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
                driverGroups: car.driverGroups.map((dg) => ({
                  ...dg,
                  models: dg.models.map((m) =>
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
                })),
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

  const addToInventory = async (model: DiecastModel, listing: EbaySearchResult, car: F1Car) => {
    try {
      console.log('📦 Adding to inventory:', listing.title);

      // Only include searchedModelId if it's a valid diecast_models ID (starts with 'model-')
      // Otherwise pass null since it's an optional field
      const searchedModelId = model.id && model.id.startsWith('model-') ? model.id : null;

      const response = await fetch('/api/admin/add-to-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: listing.title,
          price: listing.price,
          url: listing.url,
          imageUrl: listing.image,
          sourceType: 'ebay',
          sourceName: 'eBay',
          retailerId: null,
          aiScore: listing.score || 0,
          aiReason: listing.aiReason || 'No reason provided',
          searchedModelId,
          searchQuery: `${model.manufacturer} ${model.scale} ${car.team} ${model.driver} ${model.eventName}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add to inventory');
      }

      console.log('✅ Added to inventory');
      alert('✅ Added to inventory for later review!');
    } catch (error: any) {
      console.error('Error adding to inventory:', error);
      alert(`❌ Failed to add: ${error.message}`);
    }
  };

  const removeEbayLink = async (carId: string, model: DiecastModel) => {
    if (!confirm('Remove eBay link for this model?')) return;

    try {
      console.log('Removing eBay link for model:', model.id);

      // Delete from Supabase
      const response = await fetch('/api/admin/delete-ebay-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete eBay link from database');
      }

      // Update local state
      setF1Cars((prev) =>
        prev.map((car) =>
          car.id === carId
            ? {
                ...car,
                driverGroups: car.driverGroups.map((dg) => ({
                  ...dg,
                  models: dg.models.map((m) =>
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
                })),
              }
            : car
        )
      );

      alert('✅ eBay link removed');
    } catch (error) {
      console.error('Error removing eBay link:', error);
      alert('❌ Failed to remove eBay link');
    }
  };

  const searchForCar = async () => {
    if (!addModelForm.year || !addModelForm.team) {
      alert('Please enter year and team');
      return;
    }

    setSearchingCar(true);
    try {
      const response = await fetch('/api/admin/search-car', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: addModelForm.year,
          team: addModelForm.team,
        }),
      });

      const data = await response.json();

      if (data.success && data.car) {
        setSearchedCar(data.car);
        alert(`✅ Found: ${data.car.year} ${data.car.team?.name} ${data.car.livery_name}`);
      } else {
        // Car not found - offer to create
        const createIt = confirm(
          `No car found for ${addModelForm.year} ${addModelForm.team}.\n\nWould you like to create it?`
        );
        if (createIt) {
          // Create the car
          const createResponse = await fetch('/api/admin/create-car', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              year: addModelForm.year,
              team: addModelForm.team,
              chassis: null,
            }),
          });

          const createData = await createResponse.json();

          if (createData.success && createData.car) {
            setSearchedCar(createData.car);
            alert(`✅ Created: ${createData.message}`);
          } else {
            alert(`❌ Failed to create car: ${createData.error}`);
            setSearchedCar(null);
          }
        } else {
          setSearchedCar(null);
        }
      }
    } catch (error) {
      console.error('Error searching for car:', error);
      alert('Failed to search for car');
      setSearchedCar(null);
    } finally {
      setSearchingCar(false);
    }
  };

  const createModelFromForm = async () => {
    if (!searchedCar) {
      alert('Please search for a car first');
      return;
    }

    if (!addModelForm.manufacturer || !addModelForm.scale) {
      alert('Please fill in manufacturer and scale');
      return;
    }

    try {
      const response = await fetch('/api/admin/create-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carId: searchedCar.id,
          manufacturer: addModelForm.manufacturer,
          scale: addModelForm.scale,
          sku: addModelForm.sku,
          driver: addModelForm.driver,
          eventName: addModelForm.eventName,
          price: addModelForm.price,
          imageUrl: addModelForm.imageUrl,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ Model created successfully!');
        // Reset form
        setAddModelForm({
          manufacturer: '',
          scale: '',
          sku: '',
          year: '2024',
          team: '',
          driver: '',
          eventName: '',
          price: '',
          imageUrl: '',
        });
        setSearchedCar(null);
        setAddModelModalOpen(false);
        // Refresh data
        const refreshResponse = await fetch('/api/admin/get-f1-data');
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setF1Cars(refreshData.cars);
        }
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error creating model:', error);
      alert('Failed to create model');
    }
  };

  const deleteModel = async (carId: string, model: DiecastModel, returnToInventory: boolean = false) => {
    const action = returnToInventory ? 'move back to inventory' : 'delete permanently';
    if (!confirm(`Are you sure you want to ${action} "${model.name}"?`)) return;

    try {
      console.log('Deleting model:', model.id);

      // Delete from Supabase
      const response = await fetch('/api/admin/delete-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete model from database');
      }

      // Remove from cars list
      setF1Cars((prev) =>
        prev.map((car) =>
          car.id === carId
            ? {
                ...car,
                driverGroups: car.driverGroups.map((dg) => ({
                  ...dg,
                  models: dg.models.filter((m) => m.id !== model.id),
                })),
              }
            : car
        )
      );

      // Optionally add back to inventory
      if (returnToInventory && model.discoveredFrom) {
        setInventoryItems((prev) => [...prev, model]);
      }

      alert(returnToInventory ? '✅ Model moved back to inventory' : '✅ Model deleted');
    } catch (error) {
      console.error('Error deleting model:', error);
      alert('❌ Failed to delete model');
    }
  };

  // Parse eBay title to extract model data
  const parseTitle = (title: string) => {
    const parsed = {
      manufacturer: '',
      scale: '',
      driver: '',
      eventName: '',
      sku: '',
    };

    // Common manufacturers
    const manufacturers = ['Minichamps', 'Spark', 'Bburago', 'Hot Wheels', 'Mattel', 'Tarmac Works', 'IXO', 'AutoArt'];
    for (const mfr of manufacturers) {
      if (title.toLowerCase().includes(mfr.toLowerCase())) {
        parsed.manufacturer = mfr;
        break;
      }
    }

    // Scale patterns (1:43, 1/43, 1-43)
    const scaleMatch = title.match(/1[:\/-](\d+)/);
    if (scaleMatch) {
      parsed.scale = `1:${scaleMatch[1]}`;
    }

    // SKU patterns (numbers, often at end)
    const skuMatch = title.match(/\b(\d{6,})\b/);
    if (skuMatch) {
      parsed.sku = skuMatch[1];
    }

    // Event/GP names
    const events = ['Monaco', 'Miami', 'Singapore', 'Abu Dhabi', 'Bahrain', 'Saudi', 'Jeddah', 'Imola', 'Barcelona', 'Silverstone', 'Monza', 'Spa', 'Suzuka', 'Austin', 'Mexico', 'Brazil', 'Las Vegas', 'Qatar'];
    for (const event of events) {
      if (title.toLowerCase().includes(event.toLowerCase())) {
        parsed.eventName = title.includes('GP') ? `${event} GP` : event;
        break;
      }
    }

    // Common drivers
    const drivers = ['Max Verstappen', 'Lewis Hamilton', 'Charles Leclerc', 'Lando Norris', 'Oscar Piastri', 'Carlos Sainz', 'George Russell', 'Fernando Alonso', 'Sergio Perez', 'Pierre Gasly'];
    for (const driver of drivers) {
      if (title.toLowerCase().includes(driver.toLowerCase())) {
        parsed.driver = driver;
        break;
      }
    }

    return parsed;
  };

  // Handle drag start
  const handleDragStart = () => {
    setIsDragging(true);
  };

  // Handle drag and drop
  const handleDragEnd = async (event: DragEndEvent) => {
    setIsDragging(false);

    const { active, over } = event;

    if (!over) return;

    console.log('📦 Drag ended:', { active: active.id, over: over.id });

    const inventoryItemId = active.id as string;
    const dropZoneId = over.id as string;

    // Find the inventory item
    const item = inventoryItems.find(i => i.id === inventoryItemId);
    if (!item) return;

    // Check if dropped on "Create New Model" zone
    if (dropZoneId.startsWith('create-new-')) {
      const carId = dropZoneId.replace('create-new-', '');
      console.log(`➕ Creating new model for car: ${carId}`);

      // Find the car
      const car = f1Cars.find(c => c.id === carId);
      if (!car) return;

      // Parse the eBay title to extract model data
      const parsedData = parseTitle(item.title);

      // Pre-fill the form with parsed data
      setNewModelData({
        manufacturer: parsedData.manufacturer,
        scale: parsedData.scale,
        driver: parsedData.driver,
        eventName: parsedData.eventName,
        sku: parsedData.sku,
        inventoryItemId: item.id,
        carId: carId,
        title: item.title,
        price: item.price || '',
        url: item.url,
        imageUrl: item.image_url || '',
      });

      // Open the modal
      setCreateModelModalOpen(true);
      return;
    }

    // Otherwise, it's a regular model link
    const modelId = dropZoneId;

    try {
      console.log(`🔗 Linking inventory item to model: ${modelId}`);

      const response = await fetch('/api/admin/link-inventory-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryItemId,
          modelId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to link item');
      }

      console.log('✅ Successfully linked item to model');

      // Remove from inventory UI
      setInventoryItems(prev => prev.filter(i => i.id !== inventoryItemId));
      setInventoryCount(prev => prev - 1);

      alert(`✅ Linked "${item.title}" to model!`);

    } catch (error: any) {
      console.error('Error linking inventory item:', error);
      alert(`❌ Failed to link: ${error.message}`);
    }
  };

  // Retailer search functions
  const searchRetailers = async (model: DiecastModel, car: F1Car) => {
    setLoadingRetailers(true);
    setSelectedModel(model);
    setRetailerResults([]);

    try {
      console.log('🔍 Searching existing retailer links for model:', model.id);

      const response = await fetch('/api/admin/search-retailers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to search retailers');
      }

      const data = await response.json();
      setRetailerResults(data.results || []);

      // Log detailed search summary
      console.log(`✅ Search complete: Found ${data.results?.length || 0} results from ${data.count || 0} total listings`);

      // Group results by retailer for summary
      const resultsByRetailer = (data.results || []).reduce((acc: any, result: any) => {
        acc[result.retailerName] = (acc[result.retailerName] || 0) + 1;
        return acc;
      }, {});

      console.log('📊 Results by retailer:', resultsByRetailer);
    } catch (error) {
      console.error('Error searching retailers:', error);
      alert('Failed to search retailers. Check console for details.');
    } finally {
      setLoadingRetailers(false);
    }
  };

  const refreshRetailers = async (model: DiecastModel, car: F1Car) => {
    if (!model.sku) {
      alert('⚠️ This model has no SKU - cannot search retailers.');
      return;
    }

    const confirmed = confirm(
      `🔄 This will search all 24 retailers for SKU "${model.sku}".\n\n` +
      `⏱️  This will take 1-3 minutes to avoid rate limiting.\n\n` +
      `Continue?`
    );

    if (!confirmed) return;

    setLoadingRetailers(true);
    setSelectedModel(model);
    setRetailerResults([]);

    try {
      console.log('🔄 Refreshing retailers from live stores for SKU:', model.sku);

      const response = await fetch('/api/admin/refresh-retailers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id, sku: model.sku }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh retailers');
      }

      const data = await response.json();
      setRetailerResults(data.results || []);

      console.log(`✅ Refresh complete: Found ${data.count} results, saved ${data.saved} to database`);

      if (data.count > 0) {
        alert(`✅ Found ${data.count} retailer(s) and saved ${data.saved} to database!`);
      } else {
        alert('⚠️ No retailers found with this SKU. Try searching manually on retailer websites.');
      }
    } catch (error: any) {
      console.error('Error refreshing retailers:', error);
      alert(`❌ Failed to refresh: ${error.message}`);
    } finally {
      setLoadingRetailers(false);
    }
  };

  const saveRetailerLink = async (model: DiecastModel, result: RetailerSearchResult) => {
    try {
      console.log('💾 Saving retailer link to database...');

      const response = await fetch('/api/admin/save-retailer-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: model.id,
          retailerId: result.retailerId,
          retailerName: result.retailerName,
          productUrl: result.url,
          price: result.price,
          title: result.title,
          imageUrl: result.image,
          inStock: result.inStock,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save retailer link');
      }

      alert(`✅ Linked to ${result.retailerName}!`);
      setRetailerResults([]);
      setSelectedModel(null);
    } catch (error: any) {
      console.error('Error saving retailer link:', error);
      alert(`❌ Failed to save: ${error.message}`);
    }
  };

  const filteredCars = f1Cars.filter((car) => {
    const matchesYear = selectedYear === null || car.year === selectedYear;

    const matchesSearch =
      searchTerm === '' ||
      car.team.toLowerCase().includes(searchTerm.toLowerCase()) ||
      car.chassis.toLowerCase().includes(searchTerm.toLowerCase()) ||
      car.driverGroups.some((dg) => dg.driver.toLowerCase().includes(searchTerm.toLowerCase()));

    // Filter by eBay linking status
    const allModels = car.driverGroups.flatMap(dg => dg.models);
    if (filter === 'linked') {
      return matchesYear && matchesSearch && allModels.some((m) => m.ebayLinked);
    } else if (filter === 'unlinked') {
      return matchesYear && matchesSearch && allModels.some((m) => !m.ebayLinked);
    }

    return matchesYear && matchesSearch;
  });

  // Configure drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    })
  );

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen flex flex-col bg-[var(--bg-secondary)]">
        <Navbar />

        <div className="flex-1 flex relative">
        {/* Collapsible Inventory Sidebar */}
        <div
          className={`fixed right-0 top-16 h-[calc(100vh-4rem)] bg-[var(--bg-primary)] border-l border-[var(--border-color)] transition-transform duration-300 z-50 ${
            inventorySidebarOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{
            width: '350px',
            pointerEvents: isDragging ? 'none' : 'auto',
            overflow: isDragging ? 'visible' : 'hidden'
          }}
        >
          <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              📦 Listing Inventory
            </h2>
            <button
              onClick={() => setInventorySidebarOpen(false)}
              className="px-2 py-1 text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div
            className="p-4 h-[calc(100%-60px)]"
            style={{
              overflowY: isDragging ? 'visible' : 'auto'
            }}
          >
            <p className="text-sm text-gray-400 mb-4">
              {inventoryCount} items pending review
            </p>

            {inventoryItems.length === 0 && inventorySidebarOpen && (
              <p className="text-sm text-gray-500 text-center py-8">
                No items in inventory
              </p>
            )}

            <div className="space-y-3">
              {inventoryItems.map((item) => (
                <DraggableInventoryItem key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Toggle Button (Arrow) */}
        {!inventorySidebarOpen && (
          <button
            onClick={() => setInventorySidebarOpen(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 bg-orange-600 text-white px-2 py-4 rounded-l-lg hover:bg-orange-700 z-40 flex flex-col items-center gap-1"
            title="Open Inventory"
          >
            <span className="text-xs font-bold">{inventoryCount}</span>
            <span className="text-xl">📦</span>
            <span className="text-xs">◀</span>
          </button>
        )}

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
          <div className="flex gap-3">
            <button
              onClick={() => setAddModelModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              ➕ Add Model
            </button>
            <button
              onClick={async () => {
                const carsWithModels = f1Cars.filter(car => car.driverGroups.flatMap(dg => dg.models).length > 0);
                const totalModels = carsWithModels.reduce((sum, car) => sum + car.driverGroups.flatMap(dg => dg.models).length, 0);

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
            const allModels = car.driverGroups.flatMap((dg) => dg.models);
            const linkedCount = allModels.filter((m) => m.ebayLinked).length;
            const totalModels = allModels.length;
            const drivers = car.driverGroups.map((dg) => dg.driver);

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
                      <span>Drivers: {drivers.join(', ')}</span>
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

                {/* Create New Model Drop Zone - Always visible when expanded */}
                {isExpanded && (
                  <DroppableCreateModelZone carId={car.id} />
                )}

                {/* Expanded Models List - Grouped by Driver */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    {car.driverGroups.length === 0 || allModels.length === 0 ? (
                      <div className="p-6 text-center text-[var(--text-secondary)]">
                        ⚠️ No diecast models documented for this chassis yet.
                      </div>
                    ) : (
                      <div className="p-6 space-y-6">
                        {car.driverGroups.map((driverGroup) => (
                          <div key={`${car.id}-${driverGroup.driver}`}>
                            {/* Driver Section Header */}
                            <div className="mb-3 pb-2 border-b border-[var(--border-color)]">
                              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                                👤 {driverGroup.driver} ({driverGroup.models.length} model{driverGroup.models.length !== 1 ? 's' : ''})
                              </h4>
                            </div>

                            {/* Models for this driver */}
                            <div className="space-y-4">
                              {driverGroup.models.map((model) => (
                          <DroppableModelCard key={model.id} modelId={model.id}>
                          <div
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
                                {model.sku && (
                                  <div className="mt-1 text-xs text-[var(--text-muted)] font-mono">
                                    SKU: {model.sku}
                                  </div>
                                )}
                                {model.discoveredFrom && (
                                  <div className="mt-1 text-xs text-green-400">
                                    🇦🇺 {model.discoveredFrom}
                                    {model.price && <span className="ml-2 text-[var(--text-secondary)]">${model.price}</span>}
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={() => searchRetailers(model, car)}
                                  disabled={loadingRetailers}
                                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                                  title="Show existing retailer links from database"
                                >
                                  🏪 Retailers
                                </button>
                                <button
                                  onClick={() => refreshRetailers(model, car)}
                                  disabled={loadingRetailers}
                                  className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50"
                                  title="Search live stores for this SKU (10-30 seconds)"
                                >
                                  🔄 Refresh
                                </button>
                                {!model.ebayLinked ? (
                                  <button
                                    onClick={() => searchEbay(model, car)}
                                    disabled={loading}
                                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    🔍 eBay
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => removeEbayLink(car.id, model)}
                                    className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                                    title="Remove eBay link only"
                                  >
                                    ❌ Unlink
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteModel(car.id, model, true)}
                                  className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700"
                                  title="Move back to inventory"
                                >
                                  ↩️ Return
                                </button>
                                <button
                                  onClick={() => deleteModel(car.id, model, false)}
                                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                                  title="Delete permanently from database"
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            </div>

                            {/* Linking Status Box */}
                            <div className="bg-gray-800/20 border border-gray-700/30 rounded-lg p-3 space-y-3">
                              {/* eBay Status */}
                              {model.ebayLinked ? (
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
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
                                <div>
                                  <span className="text-gray-400 text-sm">🛑 eBay: Not linked</span>
                                </div>
                              )}

                              {/* Retailer Status */}
                              {model.retailerPrices && model.retailerPrices.length > 0 ? (
                                <div className="border-t border-gray-700/30 pt-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-green-400 font-semibold text-sm">
                                      ✓ {model.retailerPrices.length} Retailer{model.retailerPrices.length !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                  <div className="text-xs space-y-2">
                                    {model.retailerPrices.map((retailer, idx) => (
                                      <div key={idx} className="flex items-center justify-between bg-[var(--bg-secondary)] p-2 rounded border border-gray-700/30">
                                        <div>
                                          <div className="text-[var(--text-primary)] font-medium">
                                            {retailer.retailerName}
                                          </div>
                                          <div className="text-[var(--text-secondary)]">
                                            {retailer.currency} ${retailer.price} (~AUD ${retailer.priceAud?.toFixed(2)})
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {retailer.inStock ? (
                                            <span className="text-green-400 text-xs">✅ In Stock</span>
                                          ) : (
                                            <span className="text-gray-400 text-xs">❌ Out of Stock</span>
                                          )}
                                          <a
                                            href={retailer.productUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                          >
                                            View
                                          </a>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="border-t border-gray-700/30 pt-3">
                                  <span className="text-gray-400 text-sm">🛑 Retailer: Not linked</span>
                                </div>
                              )}
                            </div>

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
                                        {result.score !== undefined && (
                                          <div className="text-xs text-gray-400 mt-1">
                                            🤖 Score: {result.score} {result.aiReason && `• ${result.aiReason}`}
                                          </div>
                                        )}
                                      </div>

                                      {/* High confidence (90+): Direct "Select" button */}
                                      {result.score !== undefined && result.score >= 90 && (
                                        <button
                                          onClick={() => saveEbayLink(car.id, model, result)}
                                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                        >
                                          ✓ Link Now
                                        </button>
                                      )}

                                      {/* Medium confidence (50-89): "Add to Inventory" button */}
                                      {result.score !== undefined && result.score >= 50 && result.score < 90 && (
                                        <>
                                          <button
                                            onClick={() => addToInventory(model, result, car)}
                                            className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
                                          >
                                            📦 Review Later
                                          </button>
                                          <button
                                            onClick={() => saveEbayLink(car.id, model, result)}
                                            className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                          >
                                            ✓ Link Anyway
                                          </button>
                                        </>
                                      )}

                                      {/* Fallback for no score */}
                                      {result.score === undefined && (
                                        <button
                                          onClick={() => saveEbayLink(car.id, model, result)}
                                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                        >
                                          Select
                                        </button>
                                      )}

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

                            {/* Retailer Search Results */}
                            {selectedModel?.id === model.id && retailerResults.length > 0 && (
                              <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                                <h5 className="text-xs font-semibold text-[var(--text-primary)] mb-2">
                                  🇦🇺 Australian Retailer Results
                                </h5>
                                <div className="space-y-2">
                                  {retailerResults.slice(0, 10).map((result, idx) => (
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
                                          ${result.price} AUD
                                        </div>
                                        <div className="text-xs text-[var(--text-secondary)]">
                                          {result.retailerName}
                                          {result.inStock ? ' • ✅ In Stock' : ' • ❌ Out of Stock'}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => saveRetailerLink(model, result)}
                                        className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                      >
                                        Link
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
                                  <span className="text-xs">Searching eBay...</span>
                                </div>
                              </div>
                            )}

                            {/* Retailer Loading State */}
                            {selectedModel?.id === model.id && loadingRetailers && (
                              <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                                <div className="text-center py-4 text-[var(--text-secondary)]">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto mb-2"></div>
                                  <span className="text-xs">Searching existing retailer links...</span>
                                </div>
                              </div>
                            )}

                            {/* No Retailer Results */}
                            {selectedModel?.id === model.id && !loadingRetailers && retailerResults.length === 0 && (
                              <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                                <div className="text-center py-4">
                                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                                    No existing retailer links found in database.
                                  </p>
                                  <p className="text-xs text-[var(--text-muted)] mb-3">
                                    💡 Tip: Run the scraper to automatically find retailer links, or add them manually below.
                                  </p>
                                  <button
                                    onClick={() => {
                                      const url = prompt('Enter retailer product URL:');
                                      if (!url) return;

                                      const price = prompt('Enter price (AUD):');
                                      if (!price) return;

                                      const retailerName = prompt('Enter retailer name:');
                                      if (!retailerName) return;

                                      // Find retailer ID from the retailers list
                                      // For now, we'll need to load retailers first
                                      alert('Manual entry feature coming soon! For now, please use the scraper.');
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                                  >
                                    ➕ Add Manual Link
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                          </DroppableModelCard>
                        ))}
                            </div>
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
      </div>

      <Footer />
      </div>

      {/* Create New Model Modal */}
      {createModelModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-lg border border-gray-300 p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                ➕ Create New Model
              </h2>
              <button
                onClick={() => setCreateModelModalOpen(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Source listing preview */}
            <div className="bg-[var(--bg-secondary)] p-4 rounded-lg mb-6">
              <div className="text-sm text-gray-400 mb-2">Source Listing:</div>
              <div className="flex gap-4">
                {newModelData.imageUrl && (
                  <img
                    src={newModelData.imageUrl}
                    alt="Model"
                    className="w-24 h-24 object-cover rounded"
                  />
                )}
                <div className="flex-1">
                  <div className="text-sm text-[var(--text-primary)] mb-1">
                    {newModelData.title}
                  </div>
                  <div className="text-sm text-green-400">{newModelData.price}</div>
                </div>
              </div>
            </div>

            {/* Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();

                try {
                  console.log('Creating model:', newModelData);

                  const response = await fetch('/api/admin/create-model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      manufacturer: newModelData.manufacturer,
                      scale: newModelData.scale,
                      driver: newModelData.driver,
                      eventName: newModelData.eventName,
                      sku: newModelData.sku,
                      carId: newModelData.carId,
                      inventoryItemId: newModelData.inventoryItemId,
                      ebayUrl: newModelData.url,
                      ebayPrice: newModelData.price,
                      ebayImageUrl: newModelData.imageUrl,
                    }),
                  });

                  const data = await response.json();

                  if (!response.ok) {
                    throw new Error(data.error || 'Failed to create model');
                  }

                  console.log('✅ Model created successfully:', data.model);

                  // Remove from inventory UI
                  setInventoryItems(prev => prev.filter(i => i.id !== newModelData.inventoryItemId));
                  setInventoryCount(prev => prev - 1);

                  // Close modal
                  setCreateModelModalOpen(false);

                  // Reload the page data to show the new model
                  alert(`✅ Model created successfully!\n\n${newModelData.manufacturer} ${newModelData.scale} - ${newModelData.driver}`);

                  // Reload F1 data
                  const f1Response = await fetch('/api/admin/get-f1-data');
                  const f1Data = await f1Response.json();
                  if (f1Data.success) {
                    setF1Cars(f1Data.cars);
                  }

                } catch (error: any) {
                  console.error('Error creating model:', error);
                  alert(`❌ Failed to create model: ${error.message}`);
                }
              }}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Manufacturer *
                    </label>
                    <select
                      required
                      value={newModelData.manufacturer}
                      onChange={(e) =>
                        setNewModelData({ ...newModelData, manufacturer: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">Select manufacturer...</option>
                      <option value="Minichamps">Minichamps</option>
                      <option value="Spark">Spark</option>
                      <option value="Bburago">Bburago</option>
                      <option value="Hot Wheels">Hot Wheels</option>
                      <option value="Mattel">Mattel</option>
                      <option value="Tarmac Works">Tarmac Works</option>
                      <option value="IXO">IXO</option>
                      <option value="AutoArt">AutoArt</option>
                      <option value="Amalgam">Amalgam</option>
                      <option value="Looksmart">Looksmart</option>
                      <option value="TSM">TSM</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Scale *
                    </label>
                    <select
                      required
                      value={newModelData.scale}
                      onChange={(e) =>
                        setNewModelData({ ...newModelData, scale: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">Select scale...</option>
                      <option value="1:12">1:12</option>
                      <option value="1:18">1:18</option>
                      <option value="1:43">1:43</option>
                      <option value="1:64">1:64</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Driver *
                  </label>
                  <input
                    type="text"
                    required
                    value={newModelData.driver}
                    onChange={(e) =>
                      setNewModelData({ ...newModelData, driver: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g., Lando Norris"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Event / Race
                  </label>
                  <input
                    type="text"
                    value={newModelData.eventName}
                    onChange={(e) =>
                      setNewModelData({ ...newModelData, eventName: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g., Miami GP, Monaco GP"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    SKU / Model Number
                  </label>
                  <input
                    type="text"
                    value={newModelData.sku}
                    onChange={(e) =>
                      setNewModelData({ ...newModelData, sku: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g., 537244404"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setCreateModelModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Create Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Model Modal */}
      {addModelModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                  ➕ Add New Model
                </h2>
                <button
                  onClick={() => {
                    setAddModelModalOpen(false);
                    setSearchedCar(null);
                  }}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Product Information */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                  Product Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Manufacturer *
                    </label>
                    <select
                      value={addModelForm.manufacturer}
                      onChange={(e) => setAddModelForm({ ...addModelForm, manufacturer: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    >
                      <option value="">Select...</option>
                      <option value="Minichamps">Minichamps</option>
                      <option value="Spark">Spark</option>
                      <option value="Bburago">Bburago</option>
                      <option value="Looksmart">Looksmart</option>
                      <option value="BBR">BBR</option>
                      <option value="Amalgam">Amalgam</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Scale *
                    </label>
                    <select
                      value={addModelForm.scale}
                      onChange={(e) => setAddModelForm({ ...addModelForm, scale: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    >
                      <option value="">Select...</option>
                      <option value="1:43">1:43</option>
                      <option value="1:18">1:18</option>
                      <option value="1:8">1:8</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      SKU
                    </label>
                    <input
                      type="text"
                      value={addModelForm.sku}
                      onChange={(e) => setAddModelForm({ ...addModelForm, sku: e.target.value })}
                      placeholder="e.g., 410240144"
                      className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Car Information */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                  Car Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Year *
                    </label>
                    <select
                      value={addModelForm.year}
                      onChange={(e) => setAddModelForm({ ...addModelForm, year: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    >
                      {years.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Team *
                    </label>
                    <input
                      type="text"
                      value={addModelForm.team}
                      onChange={(e) => setAddModelForm({ ...addModelForm, team: e.target.value })}
                      placeholder="e.g., Mercedes"
                      className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Driver
                    </label>
                    <input
                      type="text"
                      value={addModelForm.driver}
                      onChange={(e) => setAddModelForm({ ...addModelForm, driver: e.target.value })}
                      placeholder="e.g., Lewis Hamilton"
                      className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Event
                    </label>
                    <input
                      type="text"
                      value={addModelForm.eventName}
                      onChange={(e) => setAddModelForm({ ...addModelForm, eventName: e.target.value })}
                      placeholder="e.g., British GP Winner"
                      className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>
                </div>

                <button
                  onClick={searchForCar}
                  disabled={searchingCar || !addModelForm.year || !addModelForm.team}
                  className="mt-4 w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {searchingCar ? '🔍 Searching...' : '🔍 Search for Car'}
                </button>

                {searchedCar && (
                  <div className="mt-4 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                    <p className="text-green-400 font-semibold mb-2">✅ Car Found:</p>
                    <p className="text-[var(--text-primary)]">
                      {searchedCar.season?.year} {searchedCar.team?.name} {searchedCar.livery_name}
                    </p>
                  </div>
                )}
              </div>

              {/* Optional Fields */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                  Optional
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Price
                    </label>
                    <input
                      type="text"
                      value={addModelForm.price}
                      onChange={(e) => setAddModelForm({ ...addModelForm, price: e.target.value })}
                      placeholder="e.g., $89.99"
                      className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Image URL
                    </label>
                    <input
                      type="text"
                      value={addModelForm.imageUrl}
                      onChange={(e) => setAddModelForm({ ...addModelForm, imageUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-[var(--border)]">
                <button
                  onClick={() => {
                    setAddModelModalOpen(false);
                    setSearchedCar(null);
                  }}
                  className="flex-1 px-4 py-2 bg-[var(--surface-hover)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--border)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createModelFromForm}
                  disabled={!searchedCar || !addModelForm.manufacturer || !addModelForm.scale}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  💾 Create Model
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
