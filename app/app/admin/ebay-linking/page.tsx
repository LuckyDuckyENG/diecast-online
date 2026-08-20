'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { DndContext, DragEndEvent, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { upscaleEbayImage } from '@/lib/ebayImage';

interface RetailerPrice {
  /** price_history row id — lets actions target one retailer link, not all of them */
  id: string;
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
  chassis?: string; // e.g., "RB19" — used to reject wrong-chassis eBay listings
  eventName: string; // e.g., "Bahrain GP 2024"
  sku?: string;
  discoveredFrom?: string | null; // Retailer name
  price?: string | null; // Price from retailer
  imageUrl?: string | null; // the model's own image, if it has one
  ebayLinked?: boolean;
  ebayUrl?: string;
  ebayPrice?: string;
  ebayImage?: string | null; // listing thumbnail, upscaled before use
  lastUpdated?: string;
  /**
   * Every eBay listing on this model, cheapest first.
   *
   * ebayUrl/ebayPrice above are the CHEAPEST of these, kept so older code paths
   * still read the best offer rather than an arbitrary one. Before migration 015
   * there was only ever one listing and those fields were the whole story.
   */
  ebayCount?: number;
  ebayListings?: {
    itemId: string;
    url: string;
    price: string | null;
    priceAud: number | null;
    currency: string | null;
    title: string | null;
    image: string | null;
    condition: string | null;
    seller: string | null;
    autoLinked: boolean;
  }[];
  retailerPrices?: RetailerPrice[]; // All retailer prices from price_history table
}

interface DriverGroup {
  driver: string;
  models: DiecastModel[];
}

interface F1Car {
  /** Synthetic display key: "year-team-chassis". NOT a database id. */
  id: string;
  year: number;
  team: string;
  chassis: string; // e.g., "W15", "RB20", "SF-24"
  /** The real car UUIDs in this chassis group — use these for API calls.
   *  Optional only because loadMockData() predates it. */
  carIds?: string[];
  driverGroups: DriverGroup[]; // Models grouped by driver
}

interface EbaySearchResult {
  title: string;
  price: string;
  url: string;
  image: string;
  score?: number; // AI confidence score 0-100
  aiReason?: string; // AI reasoning for the score
  // Set by preJudge on the server. A sku-match is settled without an AI call
  // and is more reliable than any score, so it must not fall through to the
  // "no score" branch and render as the least confident option.
  pre?: { tier: 'sku-match' | 'rejected' | 'needs-judgement'; reason: string };
  itemId?: string;
  imageUrl?: string | null;
  priceValue?: number; // numeric price; `price` is the display string
  priceAud?: number | null;
  currency?: string | null;
  marketplace?: string;
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
  // Why the result list is empty. Without this, "eBay has nothing" and "the
  // search errored" both render as a blank panel and look like a broken button.
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [retailerResults, setRetailerResults] = useState<RetailerSearchResult[]>([]);
  const [selectedModel, setSelectedModel] = useState<DiecastModel | null>(null);
  const [expandedCars, setExpandedCars] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingRetailers, setLoadingRetailers] = useState(false);
  const [refreshingPrice, setRefreshingPrice] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [inventorySidebarOpen, setInventorySidebarOpen] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [inventoryCount, setInventoryCount] = useState(0);

  // Bulk retailer refresh. Walks the plan in small batches so no single request
  // runs for minutes, progress is visible, and it can be stopped part-way.
  const REFRESH_BATCH_SIZE = 8;
  const [refreshAllState, setRefreshAllState] = useState<{
    running: boolean;
    dryRun: boolean;
    done: number;
    total: number;
    updated: number;
    unchanged: number;
    failed: number;
    suspicious: any[];
  } | null>(null);
  const refreshAllCancel = useRef(false);

  /**
   * Bulk eBay refresh. Same batched shape as the retailer one and for the same
   * reason, plus one extra: it is what keeps eBay prices quotable at all. The
   * site refuses to show a price older than 30 days, and nothing has ever
   * re-checked an eBay link, so the first of them goes quiet on 2026-09-06.
   */
  const [refreshEbayState, setRefreshEbayState] = useState<{
    running: boolean;
    dryRun: boolean;
    done: number;
    total: number;
    updated: number;
    unchanged: number;
    soldOut: number;
    dead: number;
    failed: number;
    observations: number;
    backfilled: number;
    suspicious: any[];
  } | null>(null);
  const refreshEbayCancel = useRef(false);

  // Batch eBay search. One request covers a whole scope — the route groups
  // models by chassis and manufacturer and issues one eBay search per group,
  // so there is no per-model progress to stream. It returns a plan instead.
  const [batchSeason, setBatchSeason] = useState<string>('');
  const [batchTeam, setBatchTeam] = useState<string>('');
  const [batchState, setBatchState] = useState<{
    running: boolean;
    dryRun: boolean;
    result: any | null;
    error: string | null;
  } | null>(null);
  // Review items accepted from the batch panel. Without this the panel reports
  // matches it gives you no way to act on, and the only route to them is the
  // per-model search button — the tedium the batch layer exists to remove.
  const [acceptedReview, setAcceptedReview] = useState<Record<string, 'saving' | 'done' | string>>({});

  // Retailer feed sweep — discovery and refresh from one download
  const [sweepRetailers, setSweepRetailers] = useState<any[]>([]);
  const [sweepTarget, setSweepTarget] = useState<string>('');
  const [sweepState, setSweepState] = useState<{
    running: boolean;
    result: any | null;
    error: string | null;
  } | null>(null);

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

  // Smart Paste verification modal
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyData, setVerifyData] = useState({
    manufacturer: '',
    scale: '',
    sku: '',
    driver: '',
    eventName: '',
    seasonYear: '',
    team: '',
    chassis: '',
    price: '',
    currency: 'AUD',
    productUrl: '',
  });

  // Edit Model modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<any>(null);
  const [editData, setEditData] = useState({
    modelId: '',
    manufacturer: '',
    scale: '',
    sku: '',
    driver: '',
    eventName: '',
    price: '',
  });

  // Duplicate SKU warning modal state
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<any>(null);

  // Edit Retailer Link modal state
  const [editRetailerModalOpen, setEditRetailerModalOpen] = useState(false);
  const [editRetailerData, setEditRetailerData] = useState({
    priceHistoryId: '',
    retailerName: '',
    price: '',
    currency: 'AUD',
    inStock: true,
    productUrl: '',
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
    pasteInput: '',
  });
  const [searchedCar, setSearchedCar] = useState<any>(null);
  const [searchingCar, setSearchingCar] = useState(false);

  // Edit Car modal state
  const [editCarModalOpen, setEditCarModalOpen] = useState(false);

  // Add Retailer modal state
  const [addRetailerModalOpen, setAddRetailerModalOpen] = useState(false);
  const [addRetailerModel, setAddRetailerModel] = useState<DiecastModel | null>(null);
  const [addRetailerUrl, setAddRetailerUrl] = useState('');
  const [addRetailerPrice, setAddRetailerPrice] = useState('');
  const [addRetailerName, setAddRetailerName] = useState('');
  const [addRetailerManualMode, setAddRetailerManualMode] = useState(false);
  const [editingCar, setEditingCar] = useState<any>(null);
  const [editCarForm, setEditCarForm] = useState({
    liveryName: '',
    drivers: [] as string[],
    newDriverName: '',
  });

  /**
   * Seasons to offer, newest first.
   *
   * Was hardcoded `2025 - i` for 31 years, so importing 2026 produced 79 cars
   * that existed in the database and could not be selected here — and it would
   * have silently gone stale again every January regardless.
   *
   * Derived from three things so it cannot fall behind: whatever seasons the
   * loaded data actually contains, next calendar year (models for a season go
   * on sale months before it starts — 2026 stock was listed in 2025), and a
   * floor of 1995 so empty older seasons stay pickable for adding to.
   */
  const years = (() => {
    const fromData = f1Cars.map(c => c.year).filter(y => Number.isFinite(y));
    const newest = Math.max(new Date().getFullYear() + 1, ...fromData, 1995);
    return Array.from({ length: newest - 1995 + 1 }, (_, i) => newest - i);
  })();

  // Load F1 cars from Supabase
  useEffect(() => {
    const loadF1Data = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
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

  // Which retailers publish a feed. Probed live rather than hardcoded, so a
  // shop that switches platform shows up as sweepable without a code change.
  useEffect(() => {
    fetch('/api/admin/sweep-retailer', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.success) setSweepRetailers(d.retailers.filter((r: any) => r.sweepable)); })
      .catch(() => {});
  }, []);

  // Load inventory count
  useEffect(() => {
    const loadInventoryCount = async () => {
      try {
        const response = await fetch('/api/admin/get-inventory-count', { cache: 'no-store' });
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
        const response = await fetch('/api/admin/get-inventory', { cache: 'no-store' });
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

  /**
   * Search eBay for a whole scope at once.
   *
   * Always dry-run first. The plan it returns is exactly what a live run would
   * do, so the review list below is worth reading before committing — the SKU
   * tier is reliable, but it is still writing links without anyone looking.
   */
  const runBatchEbay = async (dryRun: boolean) => {
    const body: any = {
      dryRun,
      /**
       * Search regardless of when this model was last searched.
       *
       * The route defaults to 30 days, which was right when one listing per
       * model was the goal: a searched model was a finished model, and skipping
       * it saved an API call. A model now holds every listing found for it, so
       * a re-search is what discovers the other sellers — and with the log
       * running only days old, the 30-day default would skip every model that
       * already has a link and report "nothing to search".
       *
       * A full pass is around 28 broad searches, so there is nothing to save.
       */
      recheckAfterDays: 0,
    };
    if (batchSeason) {
      body.season = parseInt(batchSeason, 10);
      if (batchTeam) body.team = batchTeam;
    } else {
      body.all = true;
    }

    if (!dryRun) {
      const label = batchSeason
        ? `${batchSeason}${batchTeam ? ' ' + batchTeam : ''}`
        : 'every model';
      const ok = confirm(
        `Link eBay listings for ${label}?\n\n` +
        `Only listings whose title contains the model's SKU are linked ` +
        `automatically. Everything else is reported for you to decide.\n\n` +
        `A model keeps EVERY listing found for it, deduped to the cheapest per ` +
        `seller, so models that already have one link will gain more.`
      );
      if (!ok) return;
    }

    setBatchState({ running: true, dryRun, result: null, error: null });

    try {
      const res = await fetch('/api/admin/batch-ebay-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Batch search failed');

      setBatchState({ running: false, dryRun, result: data, error: null });

      if (!dryRun) {
        const refreshed = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
        const fresh = await refreshed.json();
        if (fresh.success) setF1Cars(fresh.cars);
      }
    } catch (err: any) {
      setBatchState({ running: false, dryRun, result: null, error: err.message });
    }
  };

  /**
   * Accept one review-tier match from the batch panel.
   *
   * These are never written automatically — a match decided on race and driver
   * rather than a SKU, or one whose price or event looked wrong. Accepting is
   * the person's judgement, so it is recorded with auto_linked = false and does
   * not appear in the "added without anyone looking" view.
   */
  const acceptReviewMatch = async (m: any) => {
    setAcceptedReview(prev => ({ ...prev, [m.modelId]: 'saving' }));
    try {
      const res = await fetch('/api/admin/save-ebay-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: m.modelId,
          ebayUrl: m.url,
          ebayPrice: m.price,
          ebayTitle: m.title,
          ebayImage: m.image,
          ebayItemId: m.itemId,
          marketplace: m.marketplace,
          currency: m.currency,
          autoLinked: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to save');

      setAcceptedReview(prev => ({ ...prev, [m.modelId]: 'done' }));

      const refreshed = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
      const fresh = await refreshed.json();
      if (fresh.cars) setF1Cars(fresh.cars);
    } catch (err: any) {
      setAcceptedReview(prev => ({ ...prev, [m.modelId]: err.message }));
    }
  };

  /**
   * Sweep one retailer's product feed.
   *
   * Dry run first, always: it returns exactly what a live run would write.
   * Unlike the eBay matcher there is no identity review tier — the SKU comes
   * from a structured field rather than a parsed title — so what needs your eye
   * is the price column, which is where the guards report.
   */
  const runSweep = async (dryRun: boolean) => {
    if (!sweepTarget) return;
    const shop = sweepRetailers.find(r => r.id === sweepTarget);

    if (!dryRun) {
      const ok = confirm(
        `Apply the sweep for ${shop?.name}?\n\n` +
        `New links and price/stock changes are written. Pre-orders and price ` +
        `outliers are held back. Hand-picked product URLs keep their URL and ` +
        `only get a fresh price.`
      );
      if (!ok) return;
    }

    setSweepState({ running: true, result: null, error: null });
    try {
      const res = await fetch('/api/admin/sweep-retailer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailerId: sweepTarget, dryRun }),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Sweep failed');
      setSweepState({ running: false, result: data, error: null });

      if (!dryRun) {
        const refreshed = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
        const fresh = await refreshed.json();
        if (fresh.cars) setF1Cars(fresh.cars);
      }
    } catch (err: any) {
      setSweepState({ running: false, result: null, error: err.message });
    }
  };

  const searchEbay = async (model: DiecastModel, car: F1Car) => {
    setLoading(true);
    setSelectedModel(model);
    setSearchResults([]);
    setSearchNote(null);

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

      // Prepare model info for matching.
      //
      // chassis matters as much as anything here: preJudge rejects a listing
      // whose chassis code contradicts the target, and that is the only check
      // that separates an RB21 from an RB19 when manufacturer, driver, race
      // and scale all agree. Omitting it left that check permanently dead.
      const modelInfo = {
        manufacturer: model.manufacturer,
        scale: model.scale,
        team: car.team,
        driver: model.driver,
        eventName: model.eventName || '',
        chassis: model.chassis || car.chassis || '',
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

      // The API speaks the eBay Browse shape (imageUrl, numeric price); this
      // page has always read .image and a display string. They were never
      // reconciled, so thumbnails silently fell back to the placeholder and
      // saved links stored no image at all. Translate once, here.
      const listings: EbaySearchResult[] = (data.listings || []).map((l: any) => ({
        ...l,
        image: l.image ?? l.imageUrl ?? '',
        priceValue: typeof l.price === 'number' ? l.price : parseFloat(String(l.price ?? '')),
        price:
          typeof l.price === 'number'
            ? `${l.currency || ''} ${l.price.toFixed(2)}`.trim()
            : String(l.price ?? ''),
        marketplace: l.marketplace ?? data.marketplace,
      }));

      setSearchResults(listings);

      if (listings.length === 0) {
        // Distinguish the two ways this comes back empty. "eBay has nothing"
        // is real information about a model; "everything was rejected" means
        // the search terms found the wrong products.
        if (data.noResults) {
          setSearchNote(`No listings on ${data.marketplace === 'EBAY_US' ? 'eBay US' : 'eBay AU'} for this model.`);
        } else if (data.rejectedCount > 0) {
          setSearchNote(
            `${data.rejectedCount} listing${data.rejectedCount === 1 ? '' : 's'} found, all ruled out ` +
            `on scale, chassis or year.`
          );
        } else {
          setSearchNote('No matching listings.');
        }
      }
    } catch (error) {
      console.error('Error searching eBay:', error);
      setSearchNote('Search failed — check the console.');
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
          // The numeric value, not the "AUD 410.40" display string
          ebayPrice: listing.priceValue ?? listing.price,
          ebayTitle: listing.title,
          ebayImage: listing.image,
          // Without these the API fell back to USD for anything saved from
          // this page, so an AUD 410.40 listing was stored with a price_aud
          // converted as though it were US dollars.
          marketplace: listing.marketplace,
          currency: listing.currency,
          ebayItemId: listing.itemId,
          // Saved by hand from this page, so a person did look at it
          autoLinked: false,
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

  /**
   * Use the linked eBay listing's photo as the model image.
   *
   * The retailer equivalent has to fetch the product page and dig an image out
   * of og:image / twitter:image / JSON-LD. Here the Browse API already returned
   * one and it is stored on the link, so this only upgrades the size and saves.
   *
   * Worth knowing what this image IS: a photo of the item the seller is
   * actually selling, which may be a used model, a stock photo, or a shot with
   * the box. It is a good fallback for a model that has no image at all — and a
   * worse choice than a retailer's clean product shot when one exists.
   *
   * `source` names WHICH listing to take the photo from. A model can hold
   * several listings now, and a single unlabelled button above a list of three
   * gave no way to tell what you were about to get — it silently used whichever
   * was cheapest, which is the wrong axis entirely: the cheapest seller is not
   * the best photographer. Pass the listing explicitly, and say whose photo it
   * is in the confirm.
   */
  const setEbayImageAsModelImage = async (
    model: DiecastModel,
    source?: { image?: string | null; seller?: string | null; price?: string | null }
  ) => {
    const full = upscaleEbayImage(source ? source.image : model.ebayImage);
    if (!full) {
      alert('❌ That eBay listing has no image stored.');
      return;
    }

    const whose = source?.seller
      ? `${source.seller}${source.price ? ` (${source.price})` : ''}`
      : 'this eBay listing';

    const warning = model.imageUrl
      ? `This model already has an image. Replace it with the photo from ${whose}?\n\n` +
        'eBay photos are of the actual item being sold, so they can show a used ' +
        'model or the box. Retailer product shots are usually cleaner.'
      : `Use the photo from ${whose} as this model image?`;

    if (!confirm(`📸 ${warning}`)) return;

    try {
      const res = await fetch('/api/admin/update-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id, imageUrl: full }),
      });
      const data = await res.json();

      if (!data.success) {
        alert('❌ Failed to update image: ' + (data.error || 'unknown error'));
        return;
      }

      const refreshed = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
      const fresh = await refreshed.json();
      if (fresh.cars) setF1Cars(fresh.cars);
    } catch (err) {
      console.error('Error setting eBay image:', err);
      alert('❌ Error setting image');
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

  /**
   * Walk every eBay listing in batches.
   *
   * Oldest-checked first, so stopping part-way has still rescued the links
   * closest to going stale rather than an arbitrary slice.
   */
  const runRefreshEbay = async (dryRun: boolean) => {
    refreshEbayCancel.current = false;

    let ids: string[] = [];
    try {
      const planRes = await fetch('/api/admin/refresh-ebay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: true }),
      });
      const planData = await planRes.json();
      if (!planData.success) throw new Error(planData.details || planData.error || 'Could not build plan');
      ids = planData.ids || [];
    } catch (error: any) {
      alert('❌ Could not start eBay refresh: ' + error.message);
      return;
    }

    if (ids.length === 0) {
      alert('No eBay listings to refresh.');
      return;
    }

    if (
      !dryRun &&
      !confirm(
        `Refresh ${ids.length} eBay listing(s)?

` +
          `Prices only change on the row when they move more than 2% — smaller ` +
          `moves are eBay's daily currency conversion, not repricing.

` +
          `Listings that no longer exist are DELETED. eBay returns the same 404 ` +
          `for sold, expired and delisted, so they cannot be labelled — but the ` +
          `price is kept in the observation history.

` +
          `Roughly ${Math.ceil((ids.length * 0.4) / 60)} minutes. You can stop at any point.`
      )
    ) {
      return;
    }

    const totals = {
      done: 0, updated: 0, unchanged: 0, soldOut: 0, dead: 0,
      failed: 0, observations: 0, backfilled: 0, suspicious: [] as any[],
    };
    setRefreshEbayState({ running: true, dryRun, total: ids.length, ...totals });

    for (let i = 0; i < ids.length; i += REFRESH_BATCH_SIZE) {
      if (refreshEbayCancel.current) break;
      const batch = ids.slice(i, i + REFRESH_BATCH_SIZE);

      try {
        const res = await fetch('/api/admin/refresh-ebay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ebayLinkIds: batch, dryRun }),
        });
        const data = await res.json();

        if (data.success) {
          totals.updated += data.summary?.updated || 0;
          totals.unchanged += data.summary?.unchanged || 0;
          totals.soldOut += data.summary?.soldOut || 0;
          totals.dead += data.summary?.dead || 0;
          totals.failed += data.summary?.failed || 0;
          totals.observations += data.summary?.observations || 0;
          totals.backfilled += data.summary?.backfilled || 0;
          if (data.suspicious?.length) totals.suspicious.push(...data.suspicious);
        } else {
          // Count a whole failed batch rather than losing track of it
          totals.failed += batch.length;
        }
      } catch {
        totals.failed += batch.length;
      }

      totals.done += batch.length;
      setRefreshEbayState({ running: true, dryRun, total: ids.length, ...totals });
    }

    setRefreshEbayState({ running: false, dryRun, total: ids.length, ...totals });

    if (!dryRun) {
      try {
        const r = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
        const d = await r.json();
        if (d.cars) setF1Cars(d.cars);
      } catch {
        // The refresh succeeded; a stale view is recoverable
      }
    }
  };

  /**
   * Walk every retailer link in batches.
   *
   * The route can do all 104 in one call, but that's a ~5 minute request with no
   * feedback and nothing to show if it dies half way. Batching keeps each request
   * short, shows progress, and lets you stop. The plan comes back interleaved by
   * retailer so we don't hammer one shop.
   */
  const runRefreshAll = async (dryRun: boolean) => {
    refreshAllCancel.current = false;

    let ids: string[] = [];
    try {
      const planResponse = await fetch('/api/admin/refresh-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: true }),
      });
      const planData = await planResponse.json();
      if (!planData.success) throw new Error(planData.error || 'Could not build plan');
      ids = planData.ids || [];
    } catch (error: any) {
      alert('❌ Could not start refresh: ' + error.message);
      return;
    }

    if (ids.length === 0) {
      alert('No retailer links to refresh.');
      return;
    }

    if (
      !dryRun &&
      !confirm(
        `Refresh ${ids.length} retailer link(s)?\n\n` +
          `This checks each shop's page and updates price and stock.\n` +
          `Roughly ${Math.ceil((ids.length * 3) / 60)} minutes. You can stop it at any point.`
      )
    ) {
      return;
    }

    const totals = { done: 0, updated: 0, unchanged: 0, failed: 0, suspicious: [] as any[] };
    setRefreshAllState({ running: true, dryRun, total: ids.length, ...totals });

    for (let i = 0; i < ids.length; i += REFRESH_BATCH_SIZE) {
      if (refreshAllCancel.current) {
        console.log('⏹️ Refresh cancelled by user');
        break;
      }

      const batch = ids.slice(i, i + REFRESH_BATCH_SIZE);

      try {
        const response = await fetch('/api/admin/refresh-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceHistoryIds: batch, dryRun }),
        });
        const data = await response.json();

        if (data.success) {
          totals.updated += data.summary?.updated || 0;
          totals.unchanged += data.summary?.unchanged || 0;
          totals.failed += data.summary?.failed || 0;
          if (data.suspicious?.length) totals.suspicious.push(...data.suspicious);
        } else {
          // Whole batch failed — count it rather than losing track of it
          totals.failed += batch.length;
        }
      } catch (error) {
        console.error('Batch failed:', error);
        totals.failed += batch.length;
      }

      totals.done += batch.length;
      setRefreshAllState({ running: true, dryRun, total: ids.length, ...totals });
    }

    setRefreshAllState({ running: false, dryRun, total: ids.length, ...totals });

    // Pull the updated numbers back into the page
    if (!dryRun) {
      try {
        const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
        const refreshData = await refreshResponse.json();
        if (refreshData.cars) setF1Cars(refreshData.cars);
      } catch {
        // The refresh itself succeeded; a stale view is recoverable
      }
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
        alert(
          `✅ Found: ${data.car.season?.year} ${data.car.team?.name} ${data.car.chassis_name}` +
            ` - ${data.car.event_name} - ${data.car.driver?.name}`
        );
      } else {
        // Not found. Creating a car needs chassis + driver + event (the composite
        // key), which this form doesn't collect — so show what exists instead of
        // creating a NULL-keyed duplicate.
        const existing = data.existing || data.candidates || [];
        const existingList = existing.length
          ? `\n\nCars that already exist for ${addModelForm.year} ${addModelForm.team}:\n` +
            existing
              .map((c: any) => `  • ${c.chassis_name} - ${c.event_name} - ${c.driver}`)
              .join('\n')
          : '';

        alert(
          `❌ ${data.message || `No car found for ${addModelForm.year} ${addModelForm.team}.`}` +
            existingList +
            `\n\nTo create a car, use the paste-a-URL flow — it supplies the chassis, driver and event.`
        );
        setSearchedCar(null);
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
          pasteInput: '',
        });
        setSearchedCar(null);
        setAddModelModalOpen(false);
        // Refresh data
        const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
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

  const refreshPrice = async (model: DiecastModel) => {
    setRefreshingPrice(model.id);
    try {
      console.log('🔄 Refreshing price for model:', model.id);

      const response = await fetch('/api/admin/refresh-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to refresh price');
      }

      const { summary } = data;

      if (summary.updated > 0) {
        alert(`✅ Price updated! Found ${summary.updated} price change(s)`);
        // Refresh the data to show new prices
        const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setF1Cars(refreshData.cars);
        }
      } else if (summary.unchanged > 0) {
        alert('✅ Price checked - no changes detected');
      } else {
        alert('⚠️ Could not check price - no retailer links found');
      }
    } catch (error: any) {
      console.error('Error refreshing price:', error);
      alert('❌ Failed to refresh price: ' + error.message);
    } finally {
      setRefreshingPrice(null);
    }
  };

  const addRetailer = async () => {
    if (!addRetailerModel || !addRetailerUrl.trim()) {
      alert('Please enter a retailer URL');
      return;
    }

    // Manual mode validation
    if (addRetailerManualMode) {
      if (!addRetailerName.trim() || !addRetailerPrice.trim()) {
        alert('Please enter retailer name and price');
        return;
      }
    }

    try {
      console.log('🏪 Adding retailer for model:', addRetailerModel.id, addRetailerUrl);

      const response = await fetch('/api/admin/add-retailer-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: addRetailerModel.id,
          url: addRetailerUrl,
          manualMode: addRetailerManualMode,
          retailerName: addRetailerManualMode ? addRetailerName : undefined,
          price: addRetailerManualMode ? parseFloat(addRetailerPrice) : undefined,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        // If auto-fetch failed, suggest manual mode
        if (!addRetailerManualMode && data.details?.includes('403')) {
          const retry = confirm('❌ Website is blocking automated access (403 Forbidden).\n\nWould you like to enter the price manually instead?');
          if (retry) {
            setAddRetailerManualMode(true);
            return;
          }
        }
        throw new Error(data.error || 'Failed to add retailer');
      }

      alert('✅ Retailer link added successfully!');

      // Close modal and refresh data
      setAddRetailerModalOpen(false);
      setAddRetailerUrl('');
      setAddRetailerPrice('');
      setAddRetailerName('');
      setAddRetailerManualMode(false);
      setAddRetailerModel(null);

      const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
      const refreshData = await refreshResponse.json();
      if (refreshData.success) {
        setF1Cars(refreshData.cars);
      }
    } catch (error: any) {
      console.error('Error adding retailer:', error);
      alert('❌ Failed to add retailer: ' + error.message);
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
              disabled={refreshAllState?.running}
              onClick={() => runRefreshAll(true)}
              className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
              title="Check every retailer link and report what would change, without writing anything"
            >
              🧪 Dry-run All
            </button>
            <button
              disabled={refreshAllState?.running}
              onClick={() => runRefreshAll(false)}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
              title="Refresh price and stock for every retailer link"
            >
              🔄 Refresh All Retailers
            </button>
            <button
              disabled={refreshEbayState?.running}
              onClick={() => runRefreshEbay(true)}
              className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
              title="Check every eBay listing and report what would change, without writing anything"
            >
              🧪 Dry-run eBay
            </button>
            <button
              disabled={refreshEbayState?.running}
              onClick={() => runRefreshEbay(false)}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              title="Re-check every eBay listing: price, sold-out status, and delete listings that no longer exist"
            >
              🔁 Refresh eBay
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

        {/* Batch eBay search */}
        <div className="mb-6 p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-[var(--text-primary)]">🔎 Batch eBay search</span>

            <select
              value={batchSeason}
              onChange={e => { setBatchSeason(e.target.value); setBatchTeam(''); }}
              className="px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-sm text-[var(--text-primary)]"
            >
              <option value="">All seasons</option>
              {[...new Set(f1Cars.map(c => c.year))].sort((a, b) => b - a).map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>

            <select
              value={batchTeam}
              onChange={e => setBatchTeam(e.target.value)}
              disabled={!batchSeason}
              className="px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] disabled:opacity-40"
            >
              <option value="">All teams</option>
              {[...new Set(
                f1Cars.filter(c => String(c.year) === batchSeason).map(c => c.team)
              )].sort().map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <button
              disabled={batchState?.running}
              onClick={() => runBatchEbay(true)}
              className="px-3 py-1.5 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-50"
              title="Show exactly what would be linked, without writing anything"
            >
              🧪 Dry run
            </button>
            <button
              disabled={batchState?.running}
              onClick={() => runBatchEbay(false)}
              className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50"
              title="Link every SKU match in scope"
            >
              🔗 Link SKU matches
            </button>

            {batchState?.running && (
              <span className="text-sm text-gray-400">Searching eBay…</span>
            )}
          </div>

          {batchState?.error && (
            <div className="mt-3 text-sm text-red-400">❌ {batchState.error}</div>
          )}

          {batchState?.result && (() => {
            const r = batchState.result;
            const review = r.groups.flatMap((g: any) =>
              g.matches.filter((m: any) => !m.autoLink).map((m: any) => ({ ...m, group: g.label }))
            );
            return (
              <div className="mt-4 text-sm">
                <div className="mb-2 text-[var(--text-primary)]">
                  {r.dryRun ? '🧪 Dry run' : '✅ Linked'} — scope <strong>{r.scope}</strong>
                </div>
                <div className="flex flex-wrap gap-4 text-gray-400 mb-3">
                  <span>models in scope: <strong className="text-[var(--text-primary)]">{r.totals.models}</strong></span>
                  <span>eBay searches: <strong className="text-[var(--text-primary)]">{r.totals.searches}</strong></span>
                  {/* Models and listings are different numbers now that a model
                      keeps every listing found for it. Showing only the row
                      count would read as a jump in coverage when it is the same
                      cars with more sellers. */}
                  <span>
                    {r.dryRun ? 'would link' : 'linked'}:{' '}
                    <strong className="text-green-400">{r.totals.autoLinked}</strong> models
                    {r.totals.autoLinkedListings != null && (
                      <>
                        {' / '}
                        <strong className="text-green-400">{r.totals.autoLinkedListings}</strong> listings
                      </>
                    )}
                  </span>
                  {/* Counted in LISTINGS, unlike the link count above, because
                      the review list below is one entry per listing and you
                      accept them one at a time. A models figure here would not
                      match the number of things on screen. */}
                  <span>
                    needs review:{' '}
                    <strong className={r.totals.review ? 'text-yellow-500' : 'text-[var(--text-primary)]'}>
                      {r.totals.reviewListings ?? r.totals.review}
                    </strong>
                  </span>
                  <span>no match: <strong className="text-[var(--text-primary)]">{r.totals.unmatched}</strong></span>
                </div>

                {r.message && <div className="text-gray-400">{r.message}</div>}

                {r.groups.map((g: any) => (
                  <div key={g.label} className="mb-1 text-xs text-gray-400">
                    <span className="text-[var(--text-primary)]">{g.label}</span>
                    {/* Count MODELS against the model total, not listings. The
                        numerator was g.matches.filter(autoLink).length, which
                        became a listing count once a model could match several —
                        so this read "30/19 matched", a fraction above one. */}
                    {' — '}
                    {new Set(
                      g.matches.filter((m: any) => m.autoLink).map((m: any) => m.modelId)
                    ).size}
                    /{g.models} models
                    {' · '}{g.matches.filter((m: any) => m.autoLink).length} listings
                    {' · '}pool {g.poolSize}
                    {g.truncated && (
                      <span className="text-yellow-500" title={`eBay has ${g.availableOnEbay} listings; only ${g.poolSize} were read`}>
                        {' '}of {g.availableOnEbay} ⚠
                      </span>
                    )}
                    {' · '}{g.marketplace === 'EBAY_US' ? 'US' : 'AU'}
                  </div>
                ))}

                {/* Never auto-linked: a person decides these */}
                {review.length > 0 && (
                  <div className="mt-4 border-t border-[var(--border-color)] pt-3">
                    <div className="font-semibold text-yellow-500 mb-2">
                      Needs review ({review.length})
                    </div>
                    {review.map((m: any) => (
                      <div key={m.modelId} className="mb-3 pl-2 border-l-2 border-yellow-600/40">
                        <div className="text-xs text-[var(--text-primary)]">
                          {m.model} — {m.driver} <span className="text-gray-500">[{m.sku}]</span>
                        </div>
                        <div className="text-xs text-gray-400">{m.title}</div>
                        <div className="text-xs text-gray-500 mb-1">
                          AUD {m.priceAud?.toFixed(2)} · {m.reason}
                        </div>
                        <div className="flex items-center gap-3">
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline"
                          >
                            View on eBay ↗
                          </a>
                          {acceptedReview[m.modelId] === 'done' ? (
                            <span className="text-xs text-green-400">✓ Linked</span>
                          ) : (
                            <button
                              disabled={acceptedReview[m.modelId] === 'saving'}
                              onClick={() => acceptReviewMatch(m)}
                              className="px-2 py-0.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                              title="Accept this match and link it"
                            >
                              {acceptedReview[m.modelId] === 'saving' ? 'Linking…' : '✓ Link this'}
                            </button>
                          )}
                          {acceptedReview[m.modelId] &&
                            !['saving', 'done'].includes(acceptedReview[m.modelId]) && (
                              <span className="text-xs text-red-400">
                                ❌ {acceptedReview[m.modelId]}
                              </span>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Retailer feed sweep */}
        <div className="mb-6 p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-[var(--text-primary)]">🏪 Retailer sweep</span>

            <select
              value={sweepTarget}
              onChange={e => setSweepTarget(e.target.value)}
              className="px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-sm text-[var(--text-primary)]"
            >
              <option value="">Choose a shop…</option>
              {sweepRetailers.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.links} link{r.links === 1 ? '' : 's'})
                </option>
              ))}
            </select>

            <button
              disabled={!sweepTarget || sweepState?.running}
              onClick={() => runSweep(true)}
              className="px-3 py-1.5 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-50"
              title="Download their catalogue and show what would change, writing nothing"
            >
              🧪 Dry run
            </button>
            <button
              disabled={!sweepTarget || sweepState?.running}
              onClick={() => runSweep(false)}
              className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50"
              title="Write new links and refresh prices and stock"
            >
              🏪 Apply sweep
            </button>

            {sweepState?.running && (
              <span className="text-sm text-gray-400">
                Downloading catalogue… this takes about a minute for a large shop
              </span>
            )}
            {sweepRetailers.length > 0 && (
              <span className="text-xs text-gray-500">
                {sweepRetailers.length} shops publish a feed; the rest stay manual
              </span>
            )}
          </div>

          {sweepState?.error && (
            <div className="mt-3 text-sm text-red-400">❌ {sweepState.error}</div>
          )}

          {sweepState?.result && (() => {
            const r = sweepState.result;
            const rows = (a: string) => r.matches.filter((m: any) => m.action === a);
            const section = (a: string, label: string, colour: string) => {
              const list = rows(a);
              if (!list.length) return null;
              return (
                <div className="mt-3">
                  <div className={`font-semibold ${colour} mb-1`}>{label} ({list.length})</div>
                  {list.map((m: any) => (
                    <div key={m.modelId + a} className="text-xs mb-1.5 pl-2 border-l-2 border-[var(--border-color)]">
                      <div className="text-[var(--text-primary)]">
                        {m.model} <span className="text-gray-500">[{m.sku}]</span>
                      </div>
                      <div className="text-gray-400">
                        {/* The shop's own currency, not AUD. Hardcoding AUD here
                            showed Yuui's euros as dollars. */}
                        {m.price != null ? `${r.currency} ${Number(m.price).toFixed(2)}` : 'no price'}
                        {' · '}{m.available ? 'in stock' : 'out of stock'}
                        {' · '}{m.reason}
                      </div>
                      <a href={m.url} target="_blank" rel="noopener noreferrer"
                         className="text-blue-400 hover:underline">View product ↗</a>
                    </div>
                  ))}
                </div>
              );
            };

            return (
              <div className="mt-4 text-sm">
                <div className="mb-1 text-[var(--text-primary)]">
                  {r.dryRun ? '🧪 Dry run' : `✅ Applied — ${r.written} link(s) written`} — <strong>{r.retailer}</strong>
                </div>
                {r.message && <div className="text-gray-400 mb-2">{r.message}</div>}
                {r.currencyDisputed && (
                  <div className="mb-2 text-xs text-yellow-500">
                    ⚠ Currency mismatch: the shop declares <strong>{r.declaredCurrency}</strong>, your
                    retailer record says <strong>{r.recordedCurrency}</strong>. Prices will be treated as{' '}
                    <strong>{r.currency}</strong>. Shopify also presents prices in the currency it infers
                    from the request, so check a product before applying.
                  </div>
                )}
                {r.feed && (
                  <div className="text-xs text-gray-500 mb-2">
                    {r.feed.products} products · {r.feed.skus} SKUs · {r.feed.requests} requests · {r.feed.seconds}s
                    {r.feed.truncated && (
                      <span className="text-yellow-500"> · ⚠ catalogue truncated, results incomplete</span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-4 text-gray-400">
                  <span>matched: <strong className="text-[var(--text-primary)]">{r.totals.matched}</strong></span>
                  <span>new: <strong className="text-green-400">{r.totals.new}</strong></span>
                  <span>price/stock changed: <strong className="text-[var(--text-primary)]">{r.totals.refresh}</strong></span>
                  <span>unchanged: <strong className="text-[var(--text-primary)]">{r.totals.unchanged}</strong></span>
                  <span>held back: <strong className={r.totals.hold + r.totals.review ? 'text-yellow-500' : 'text-[var(--text-primary)]'}>{r.totals.hold + r.totals.review}</strong></span>
                </div>

                {section('new', '🆕 New links', 'text-green-400')}
                {section('review', '⚠ Price looks wrong — not written', 'text-yellow-500')}
                {section('hold', '⏸ Pre-order or no price — not written', 'text-yellow-500')}
                {section('refresh', '♻ Price or stock changed', 'text-[var(--text-primary)]')}

                {r.failures?.length > 0 && (
                  <div className="mt-3 text-xs text-red-400">
                    {r.failures.length} write(s) failed: {r.failures.slice(0, 5).join('; ')}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Bulk eBay refresh progress */}
        {refreshEbayState && (
          <div className="mb-6 p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-[var(--text-primary)]">
                {refreshEbayState.running
                  ? `${refreshEbayState.dryRun ? '🧪 Dry-running' : '🔁 Refreshing'} eBay… ${refreshEbayState.done}/${refreshEbayState.total}`
                  : `${refreshEbayState.dryRun ? '🧪 Dry run' : '✅ eBay refresh'} finished — ${refreshEbayState.done}/${refreshEbayState.total} checked`}
              </div>
              {refreshEbayState.running ? (
                <button
                  onClick={() => {
                    refreshEbayCancel.current = true;
                  }}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => setRefreshEbayState(null)}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Dismiss
                </button>
              )}
            </div>

            <div className="w-full h-2 bg-[var(--border-color)] rounded overflow-hidden mb-3">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{
                  width: `${refreshEbayState.total ? (refreshEbayState.done / refreshEbayState.total) * 100 : 0}%`,
                }}
              />
            </div>

            <div className="flex flex-wrap gap-5 text-sm text-[var(--text-secondary)]">
              <span>
                {refreshEbayState.dryRun ? 'would change' : 'price changed'}:{' '}
                <strong className="text-[var(--text-primary)]">{refreshEbayState.updated}</strong>
              </span>
              {/* Unchanged is the expected majority: measured drift is 0.2% median,
                  and anything under 2% is currency conversion rather than a
                  reprice, so it deliberately does not count as a change. */}
              <span>unchanged: <strong className="text-[var(--text-primary)]">{refreshEbayState.unchanged}</strong></span>
              <span>
                sold out:{' '}
                <strong className={refreshEbayState.soldOut ? 'text-purple-400' : 'text-[var(--text-primary)]'}>
                  {refreshEbayState.soldOut}
                </strong>
              </span>
              <span>
                {refreshEbayState.dryRun ? 'would delete (gone)' : 'deleted (gone)'}:{' '}
                <strong className={refreshEbayState.dead ? 'text-red-400' : 'text-[var(--text-primary)]'}>
                  {refreshEbayState.dead}
                </strong>
              </span>
              <span>failed: <strong className="text-[var(--text-primary)]">{refreshEbayState.failed}</strong></span>
              <span>
                history rows:{' '}
                <strong className="text-green-400">{refreshEbayState.observations}</strong>
              </span>
              {refreshEbayState.backfilled > 0 && (
                <span>
                  condition/seller filled in:{' '}
                  <strong className="text-green-400">{refreshEbayState.backfilled}</strong>
                </span>
              )}
              <span>
                quarantined:{' '}
                <strong className={refreshEbayState.suspicious.length ? 'text-yellow-500' : 'text-[var(--text-primary)]'}>
                  {refreshEbayState.suspicious.length}
                </strong>
              </span>
            </div>

            {refreshEbayState.suspicious.length > 0 && (
              <div className="mt-3 text-xs text-yellow-500 space-y-1">
                {refreshEbayState.suspicious.slice(0, 6).map((s: any, i: number) => (
                  <div key={i}>{s.reason} — {s.url}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bulk refresh progress */}
        {refreshAllState && (
          <div className="mb-6 p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-[var(--text-primary)]">
                {refreshAllState.running
                  ? `${refreshAllState.dryRun ? '🧪 Dry-running' : '🔄 Refreshing'} retailers… ${refreshAllState.done}/${refreshAllState.total}`
                  : `${refreshAllState.dryRun ? '🧪 Dry run' : '✅ Refresh'} finished — ${refreshAllState.done}/${refreshAllState.total} checked`}
              </div>
              {refreshAllState.running ? (
                <button
                  onClick={() => {
                    refreshAllCancel.current = true;
                  }}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => setRefreshAllState(null)}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Dismiss
                </button>
              )}
            </div>

            <div className="w-full h-2 bg-[var(--border-color)] rounded overflow-hidden mb-3">
              <div
                className="h-full bg-orange-500 transition-all"
                style={{
                  width: `${refreshAllState.total ? (refreshAllState.done / refreshAllState.total) * 100 : 0}%`,
                }}
              />
            </div>

            <div className="flex gap-5 text-sm text-[var(--text-secondary)]">
              <span>
                {refreshAllState.dryRun ? 'would change' : 'updated'}:{' '}
                <strong className="text-[var(--text-primary)]">{refreshAllState.updated}</strong>
              </span>
              <span>unchanged: <strong className="text-[var(--text-primary)]">{refreshAllState.unchanged}</strong></span>
              <span>no price found: <strong className="text-[var(--text-primary)]">{refreshAllState.failed}</strong></span>
              <span>
                quarantined:{' '}
                <strong className={refreshAllState.suspicious.length ? 'text-yellow-500' : 'text-[var(--text-primary)]'}>
                  {refreshAllState.suspicious.length}
                </strong>
              </span>
            </div>

            {/* Implausible reads are never written — surface them so they can be fixed by hand */}
            {refreshAllState.suspicious.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
                <p className="text-sm font-semibold text-yellow-500 mb-2">
                  Not written — the scraped price was too far from the stored one:
                </p>
                <ul className="text-xs text-[var(--text-secondary)] space-y-1 max-h-40 overflow-y-auto">
                  {refreshAllState.suspicious.map((s: any) => (
                    <li key={s.id}>
                      <span className="font-mono">
                        {s.storedPrice} → {s.scrapedPrice} {s.currency} ({s.ratio}x)
                      </span>{' '}
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                        open listing
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

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
                <div className="w-full p-6 flex items-center justify-between">
                  <button
                    onClick={() => toggleCarExpand(car.id)}
                    className="flex-1 hover:bg-[var(--bg-secondary)] transition-colors text-left -m-6 p-6 mr-0"
                  >
                    <div>
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
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCar(car);
                        setEditCarForm({
                          liveryName: car.chassis,
                          drivers: drivers,
                          newDriverName: '',
                        });
                        setEditCarModalOpen(true);
                      }}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                      title="Edit car details and link drivers"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        // car.id is a display key, not a database id — the real
                        // UUIDs live in carIds. Without them there's nothing to
                        // delete, so say that rather than sending a bad request.
                        if (!car.carIds?.length) {
                          alert('❌ No car records found for this group — try refreshing the page.');
                          return;
                        }
                        if (confirm(`Delete ${car.year} ${car.team} ${car.chassis} and all its models?\n\nThis permanently deletes ${car.carIds.length} car record(s) and ${totalModels} model(s).`)) {
                          try {
                            const response = await fetch('/api/admin/delete-car', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              // car.id is the synthetic "year-team-chassis"
                              // display key; carIds holds the real UUIDs.
                              body: JSON.stringify({ carIds: car.carIds }),
                            });

                            if (response.ok) {
                              alert('✅ Car deleted successfully');
                              // Refresh data
                              const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
                              const refreshData = await refreshResponse.json();
                              if (refreshData.success) {
                                setF1Cars(refreshData.cars);
                              }
                            } else {
                              alert('❌ Failed to delete car');
                            }
                          } catch (error) {
                            alert('❌ Error deleting car');
                          }
                        }
                      }}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                      title="Delete this car and all its models"
                    >
                      🗑️ Delete
                    </button>
                    <button
                      onClick={() => toggleCarExpand(car.id)}
                      className="text-[var(--text-secondary)] ml-2 hover:text-[var(--text-primary)] px-2"
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  </div>
                </div>

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
                                {model.retailerPrices && model.retailerPrices.length > 0 ? (
                                  <button
                                    onClick={() => searchRetailers(model, car)}
                                    disabled={loadingRetailers}
                                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                                    title="Show existing retailer links from database"
                                  >
                                    🏪 Retailers
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setAddRetailerModel(model);
                                      setAddRetailerModalOpen(true);
                                    }}
                                    disabled={loadingRetailers}
                                    className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                                    title="Add retailer link manually"
                                  >
                                    ➕ Add Retailer
                                  </button>
                                )}
                                <button
                                  onClick={() => refreshRetailers(model, car)}
                                  disabled={loadingRetailers}
                                  className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50"
                                  title="Search live stores for this SKU (10-30 seconds)"
                                >
                                  🔄 Refresh
                                </button>
                                <button
                                  onClick={() => refreshPrice(model)}
                                  disabled={refreshingPrice === model.id}
                                  className="px-3 py-1.5 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-700 disabled:opacity-50"
                                  title="Check current price and update if changed"
                                >
                                  {refreshingPrice === model.id ? '⏳ Checking...' : '💰 Price'}
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
                                  onClick={() => {
                                    setEditingModel(model);
                                    setEditData({
                                      modelId: model.id,
                                      manufacturer: model.manufacturer || '',
                                      scale: model.scale || '',
                                      sku: model.sku || '',
                                      driver: model.driver || '',
                                      eventName: model.eventName || '',
                                      price: model.price?.toString() || '',
                                    });
                                    setEditModalOpen(true);
                                  }}
                                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
                                  title="Edit model details"
                                >
                                  ✏️ Edit
                                </button>
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
                                    {/*
                                      The 📸 lives on each LISTING below, not
                                      here. One button above a list of three gave
                                      no way to tell whose photo you were about
                                      to get, and it silently took the cheapest
                                      listing's — price order has nothing to do
                                      with photo quality. It only stays here as a
                                      fallback for a model whose listings array
                                      has not loaded.
                                    */}
                                    {model.ebayImage && !model.ebayListings?.length && (
                                      <button
                                        onClick={() => setEbayImageAsModelImage(model)}
                                        className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                                        title={
                                          model.imageUrl
                                            ? 'Replace the model image with the eBay listing photo'
                                            : 'Use the eBay listing photo as the model image'
                                        }
                                      >
                                        📸 {model.imageUrl ? 'Replace' : 'Use'}
                                      </button>
                                    )}
                                  </div>
                                  {/* Every listing, cheapest first.
                                      This showed one price, and after migration
                                      015 that was whichever row happened to be
                                      read last — in practice the dearest, which
                                      is the number this feature exists to stop
                                      quoting. Falls back to the old single-price
                                      display when ebayListings is absent. */}
                                  <div className="text-xs text-[var(--text-secondary)] space-y-1">
                                    {model.ebayListings && model.ebayListings.length > 0 ? (
                                      <>
                                        <div>
                                          {model.ebayListings.length} listing
                                          {model.ebayListings.length === 1 ? '' : 's'}
                                          {model.ebayListings.length > 1 && (
                                            <span className="text-green-400">
                                              {' '}· cheapest {model.ebayListings[0].price}
                                            </span>
                                          )}
                                        </div>
                                        {model.ebayListings.map((l: any) => (
                                          <div key={l.itemId} className="flex items-center gap-2">
                                            {/* The photo you would actually get,
                                                shown next to the button that
                                                takes it. Choosing an image from a
                                                price-sorted list without seeing
                                                the images is guesswork. */}
                                            {l.image ? (
                                              <img
                                                src={l.image}
                                                alt=""
                                                loading="lazy"
                                                className="w-8 h-8 object-cover rounded border border-gray-700 shrink-0"
                                              />
                                            ) : (
                                              <span className="w-8 h-8 rounded border border-gray-800 shrink-0" />
                                            )}
                                            <span className="text-[var(--text-primary)] tabular-nums">
                                              {l.price}
                                            </span>
                                            {l.condition && (
                                              <span
                                                className={
                                                  /^new$/i.test(l.condition)
                                                    ? 'text-gray-500'
                                                    : 'text-purple-400'
                                                }
                                              >
                                                {l.condition}
                                              </span>
                                            )}
                                            {l.seller && (
                                              <span className="text-gray-500 truncate">
                                                {l.seller}
                                              </span>
                                            )}
                                            <a
                                              href={l.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-400 hover:underline shrink-0"
                                            >
                                              view ↗
                                            </a>
                                            {l.image && (
                                              <button
                                                onClick={() =>
                                                  setEbayImageAsModelImage(model, {
                                                    image: l.image,
                                                    seller: l.seller,
                                                    price: l.price,
                                                  })
                                                }
                                                className="px-1.5 py-0.5 bg-purple-600 text-white rounded hover:bg-purple-700 shrink-0"
                                                title={`Use ${l.seller || 'this listing'}'s photo as the model image`}
                                              >
                                                📸
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </>
                                    ) : (
                                      <>
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
                                      </>
                                    )}
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
                                          <button
                                            onClick={async () => {
                                              // Refresh price from URL
                                              if (!retailer.productUrl) {
                                                alert('❌ No product URL to refresh from');
                                                return;
                                              }

                                              if (confirm(`🔄 Refresh price and stock for ${retailer.retailerName}?`)) {
                                                try {
                                                  setRefreshingPrice(retailer.id || `${model.id}-${idx}`);

                                                  const response = await fetch('/api/admin/refresh-prices', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                      priceHistoryId: retailer.id,
                                                      modelId: model.id
                                                    }),
                                                  });

                                                  const data = await response.json();

                                                  if (data.success) {
                                                    alert('✅ Price refreshed successfully!');
                                                    // Reload F1 data
                                                    const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
                                                    const refreshData = await refreshResponse.json();
                                                    if (refreshData.cars) {
                                                      setF1Cars(refreshData.cars);
                                                    }
                                                  } else {
                                                    alert('❌ Failed to refresh: ' + data.error);
                                                  }
                                                } catch (error) {
                                                  console.error('Error refreshing price:', error);
                                                  alert('❌ Error refreshing price');
                                                } finally {
                                                  setRefreshingPrice(null);
                                                }
                                              }
                                            }}
                                            disabled={refreshingPrice === (retailer.id || `${model.id}-${idx}`)}
                                            className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:opacity-50"
                                            title="Refresh price and stock from retailer"
                                          >
                                            {refreshingPrice === (retailer.id || `${model.id}-${idx}`) ? '...' : '🔄'}
                                          </button>
                                          <button
                                            onClick={async () => {
                                              // Set image from this retailer
                                              if (!retailer.productUrl) {
                                                alert('❌ No product URL');
                                                return;
                                              }

                                              if (confirm(`📸 Set model image from ${retailer.retailerName}?`)) {
                                                try {
                                                  // Fetch the product page
                                                  const fetchResponse = await fetch('/api/admin/fetch-url', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ url: retailer.productUrl }),
                                                  });

                                                  const fetchData = await fetchResponse.json();
                                                  if (!fetchData.success) {
                                                    alert('❌ Failed to fetch page: ' + fetchData.error);
                                                    return;
                                                  }

                                                  const html = fetchData.html;

                                                  // Extract image URL from HTML (try multiple methods)
                                                  let imageUrl = null;

                                                  // Method 1: og:image meta tag
                                                  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
                                                  if (ogImageMatch) {
                                                    imageUrl = ogImageMatch[1];
                                                  }

                                                  // Method 2: twitter:image meta tag
                                                  if (!imageUrl) {
                                                    const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
                                                    if (twitterImageMatch) {
                                                      imageUrl = twitterImageMatch[1];
                                                    }
                                                  }

                                                  // Method 3: JSON-LD structured data
                                                  if (!imageUrl) {
                                                    const jsonLdMatch = html.match(/"image":\s*"([^"]+)"/i);
                                                    if (jsonLdMatch) {
                                                      imageUrl = jsonLdMatch[1];
                                                    }
                                                  }

                                                  if (!imageUrl) {
                                                    alert('❌ Could not find product image on page');
                                                    return;
                                                  }

                                                  // Update model with new image URL
                                                  const updateResponse = await fetch('/api/admin/update-model', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                      modelId: model.id,
                                                      imageUrl: imageUrl,
                                                    }),
                                                  });

                                                  const updateData = await updateResponse.json();
                                                  if (updateData.success) {
                                                    alert('✅ Model image updated!');
                                                    // Reload F1 data
                                                    const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
                                                    const refreshData = await refreshResponse.json();
                                                    if (refreshData.cars) {
                                                      setF1Cars(refreshData.cars);
                                                    }
                                                  } else {
                                                    alert('❌ Failed to update image: ' + updateData.error);
                                                  }
                                                } catch (error) {
                                                  console.error('Error setting image:', error);
                                                  alert('❌ Error setting image');
                                                }
                                              }
                                            }}
                                            className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                                            title="Set as model image"
                                          >
                                            📸
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditRetailerData({
                                                priceHistoryId: retailer.id || '',
                                                retailerName: retailer.retailerName || '',
                                                price: retailer.price?.toString() || '0',
                                                currency: retailer.currency || 'AUD',
                                                inStock: retailer.inStock !== false,
                                                productUrl: retailer.productUrl || '',
                                              });
                                              setEditRetailerModalOpen(true);
                                            }}
                                            className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                                            title="Edit retailer link"
                                          >
                                            ✏️
                                          </button>
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

                            {/* Why there are no results, when there are none */}
                            {selectedModel?.id === model.id && searchResults.length === 0 && searchNote && (
                              <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                                <span className="text-xs text-gray-400">🔍 {searchNote}</span>
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
                                        {result.pre?.tier === 'sku-match' ? (
                                          <div className="text-xs text-green-400 mt-1">
                                            🎯 {result.pre.reason}
                                            {result.marketplace === 'EBAY_US' && ' • from eBay US'}
                                          </div>
                                        ) : result.score !== undefined ? (
                                          <div className="text-xs text-gray-400 mt-1">
                                            🤖 Score: {result.score} {result.aiReason && `• ${result.aiReason}`}
                                            {result.marketplace === 'EBAY_US' && ' • from eBay US'}
                                          </div>
                                        ) : null}
                                      </div>

                                      {/* The seller printed the SKU. Nothing an AI score says beats that. */}
                                      {result.pre?.tier === 'sku-match' && (
                                        <button
                                          onClick={() => saveEbayLink(car.id, model, result)}
                                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                        >
                                          ✓ Link Now
                                        </button>
                                      )}

                                      {/* High confidence (90+): Direct "Select" button */}
                                      {result.pre?.tier !== 'sku-match' && result.score !== undefined && result.score >= 90 && (
                                        <button
                                          onClick={() => saveEbayLink(car.id, model, result)}
                                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                        >
                                          ✓ Link Now
                                        </button>
                                      )}

                                      {/* Medium confidence (50-89): "Add to Inventory" button */}
                                      {result.pre?.tier !== 'sku-match' && result.score !== undefined && result.score >= 50 && result.score < 90 && (
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
                                      {result.pre?.tier !== 'sku-match' && result.score === undefined && (
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
                  const f1Response = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
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

      {/* Smart Paste Verification Modal */}
      {verifyModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-lg border border-gray-300 p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                ⚠️ Verify Extracted Data
              </h2>
              <button
                onClick={() => setVerifyModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Review and edit the extracted data before creating the model. Click "Create Model" to proceed or "Cancel" to abort.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setVerifyModalOpen(false);
                setSearchingCar(true);

                try {
                  // Step 1: Search for car (or create if doesn't exist)
                  const searchCarResponse = await fetch('/api/admin/search-car', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      year: parseInt(verifyData.seasonYear) || 2024,
                      team: verifyData.team,
                      driver: verifyData.driver,
                      eventName: verifyData.eventName,
                      chassis: verifyData.chassis,
                    }),
                  });

                  const carData = await searchCarResponse.json();
                  let carId;

                  if (carData.success && carData.car) {
                    carId = carData.car.id;
                  } else {
                    // Car not found. Show what already exists for this team/year
                    // so we don't blindly duplicate one.
                    const existing = carData.existing || carData.candidates || [];
                    const existingList = existing.length
                      ? `\n\nExisting cars for this team/year:\n` +
                        existing
                          .map((c: any) => `  • ${c.chassis_name} - ${c.event_name} - ${c.driver}`)
                          .join('\n')
                      : '';

                    const confirmCreate = confirm(
                      `No car found for:\n` +
                        `${verifyData.seasonYear} ${verifyData.team} ${verifyData.chassis} - ` +
                        `${verifyData.eventName} - ${verifyData.driver}` +
                        existingList +
                        `\n\nCreate this as a NEW car?`
                    );

                    if (!confirmCreate) {
                      throw new Error('Cancelled — no car selected');
                    }

                    const createCarResponse = await fetch('/api/admin/create-car', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        year: parseInt(verifyData.seasonYear) || 2024,
                        team: verifyData.team,
                        chassis: verifyData.chassis,
                        driver: verifyData.driver,
                        eventName: verifyData.eventName,
                      }),
                    });

                    const createCarData = await createCarResponse.json();
                    if (createCarData.success && createCarData.car) {
                      carId = createCarData.car.id;
                      if (createCarData.existed) {
                        console.log('♻️ Reused existing car', carId);
                      }
                    } else {
                      throw new Error(
                        createCarData.details || createCarData.error || 'Failed to create car'
                      );
                    }
                  }

                  // Step 2: Create the model
                  const createModelResponse = await fetch('/api/admin/create-model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      carId,
                      manufacturer: verifyData.manufacturer,
                      scale: verifyData.scale,
                      sku: verifyData.sku,
                      driver: verifyData.driver,
                      eventName: verifyData.eventName,
                      price: verifyData.price,
                      currency: verifyData.currency,
                      retailerUrl: verifyData.productUrl,
                    }),
                  });

                  const modelData = await createModelResponse.json();

                  if (modelData.success) {
                    alert(`✅ Model created successfully!\n\n${verifyData.manufacturer} ${verifyData.scale} - ${verifyData.driver}`);

                    // Refresh F1 data
                    const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
                    const refreshData = await refreshResponse.json();
                    if (refreshData.success) {
                      setF1Cars(refreshData.cars);
                    }
                  } else if (modelData.duplicate && modelData.duplicateModel) {
                    // Duplicate SKU detected - offer to add retailer link to existing model
                    const addRetailer = confirm(
                      `⚠️ This model already exists!\n\n` +
                      `SKU: ${modelData.duplicateModel.sku}\n` +
                      `Manufacturer: ${modelData.duplicateModel.manufacturer}\n` +
                      `Scale: ${modelData.duplicateModel.scale}\n` +
                      `Driver: ${modelData.duplicateModel.driver}\n` +
                      `Event: ${modelData.duplicateModel.eventName}\n\n` +
                      `Would you like to add this retailer link to the existing model?\n\n` +
                      `Click OK to add retailer link, or Cancel to abort.`
                    );

                    if (addRetailer) {
                      // Add retailer link to existing model
                      const addRetailerResponse = await fetch('/api/admin/add-retailer-link', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          modelId: modelData.duplicateModel.id,
                          url: verifyData.productUrl,
                          manualMode: false,
                        }),
                      });

                      const addRetailerData = await addRetailerResponse.json();

                      if (addRetailerData.success) {
                        alert('✅ Retailer link added to existing model!');

                        // Refresh F1 data
                        const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
                        const refreshData = await refreshResponse.json();
                        if (refreshData.success) {
                          setF1Cars(refreshData.cars);
                        }
                      } else {
                        throw new Error(addRetailerData.error || 'Failed to add retailer link');
                      }
                    }
                  } else {
                    throw new Error(modelData.error || 'Failed to create model');
                  }
                } catch (error: any) {
                  console.error('Error:', error);
                  alert(`❌ Error: ${error.message}`);
                } finally {
                  setSearchingCar(false);
                }
              }}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Manufacturer *
                    </label>
                    <input
                      type="text"
                      required
                      value={verifyData.manufacturer}
                      onChange={(e) => setVerifyData({ ...verifyData, manufacturer: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Scale *
                    </label>
                    <input
                      type="text"
                      required
                      value={verifyData.scale}
                      onChange={(e) => setVerifyData({ ...verifyData, scale: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g., 1:43"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Driver *
                    </label>
                    <input
                      type="text"
                      required
                      value={verifyData.driver}
                      onChange={(e) => setVerifyData({ ...verifyData, driver: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Event Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={verifyData.eventName}
                      onChange={(e) => setVerifyData({ ...verifyData, eventName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g., Bahrain GP"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Year *
                    </label>
                    <input
                      type="text"
                      required
                      value={verifyData.seasonYear}
                      onChange={(e) => setVerifyData({ ...verifyData, seasonYear: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g., 2024"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Team *
                    </label>
                    <input
                      type="text"
                      required
                      value={verifyData.team}
                      onChange={(e) => setVerifyData({ ...verifyData, team: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Chassis *
                    </label>
                    <input
                      type="text"
                      required
                      value={verifyData.chassis}
                      onChange={(e) => setVerifyData({ ...verifyData, chassis: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g., W13"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      SKU
                    </label>
                    <input
                      type="text"
                      value={verifyData.sku}
                      onChange={(e) => setVerifyData({ ...verifyData, sku: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g., 417220144"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Price
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                          {verifyData.currency === 'USD' ? '$' : verifyData.currency === 'EUR' ? '€' : verifyData.currency === 'GBP' ? '£' : '$'}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          value={verifyData.price}
                          onChange={(e) => setVerifyData({ ...verifyData, price: e.target.value })}
                          className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="199.99"
                        />
                      </div>
                    </div>
                    <div>
                      <select
                        value={verifyData.currency}
                        onChange={(e) => setVerifyData({ ...verifyData, currency: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="AUD">AUD 🇦🇺</option>
                        <option value="USD">USD 🇺🇸</option>
                        <option value="EUR">EUR 🇪🇺</option>
                        <option value="GBP">GBP 🇬🇧</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product URL
                  </label>
                  <input
                    type="text"
                    value={verifyData.productUrl}
                    onChange={(e) => setVerifyData({ ...verifyData, productUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setVerifyModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
                >
                  ✓ Create Model
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
              {/* Smart Paste Section */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                  🪄 Smart Paste (AI-Powered)
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  Paste a product URL or title and let AI extract all the details automatically
                </p>
                <div className="space-y-3">
                  <textarea
                    value={addModelForm.pasteInput || ''}
                    onChange={(e) => setAddModelForm({ ...addModelForm, pasteInput: e.target.value })}
                    placeholder="Paste URL or product title here...&#10;Example: https://anthonysdiecasts.com.au/products/spark-hamilton-miami-gp"
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] min-h-[80px]"
                  />
                  <button
                    onClick={async () => {
                      if (!addModelForm.pasteInput) {
                        alert('Please paste a URL or product title first');
                        return;
                      }

                      setSearchingCar(true);
                      try {
                        // Check if it's a URL
                        const isUrl = addModelForm.pasteInput.startsWith('http');

                        let productData;

                        if (isUrl) {
                          // Fetch via backend proxy to avoid CORS issues
                          const fetchResponse = await fetch('/api/admin/fetch-url', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: addModelForm.pasteInput }),
                          });

                          const fetchData = await fetchResponse.json();
                          if (!fetchData.success) {
                            throw new Error(fetchData.error || 'Failed to fetch URL');
                          }

                          const html = fetchData.html;

                          // Extract comprehensive product information
                          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                          const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
                          const priceMatch = html.match(/"price":\s*(\d+)/);
                          const skuMatch = html.match(/"sku":\s*"([^"]+)"/);

                          // Extract breadcrumbs (often contains team/category info)
                          let breadcrumbs = '';
                          const breadcrumbMatches = html.match(/<nav[^>]*class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i);
                          if (breadcrumbMatches) {
                            breadcrumbs = breadcrumbMatches[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                          }

                          // Extract product description (multiple possible locations)
                          let productDesc = '';

                          // Try description div/section
                          const descDivMatch = html.match(/<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                                              html.match(/<div[^>]*class=["'][^"']*product-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                                              html.match(/<section[^>]*class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
                          if (descDivMatch) {
                            productDesc = descDivMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                          }

                          // Extract product details/specifications table
                          let productDetails = '';
                          const detailsMatches = html.match(/<table[^>]*class=["'][^"']*product[^"']*["'][^>]*>([\s\S]*?)<\/table>/i) ||
                                                html.match(/<div[^>]*class=["'][^"']*product-details[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                                                html.match(/<div[^>]*class=["'][^"']*specifications[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
                          if (detailsMatches) {
                            productDetails = detailsMatches[1].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                          }

                          // Extract bullet points
                          let bulletPoints = '';
                          const bulletMatches = html.match(/<ul[^>]*class=["'][^"']*product[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
                          if (bulletMatches) {
                            bulletPoints = bulletMatches[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                          }

                          // Extract image URL
                          let imageUrl = '';
                          const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
                          if (ogImageMatch) {
                            imageUrl = ogImageMatch[1];
                          } else {
                            const imgMatch = html.match(/<img[^>]*class=["'][^"']*product[^"']*["'][^>]*src=["']([^"']+)["']/i);
                            if (imgMatch) {
                              imageUrl = imgMatch[1];
                            }
                          }

                          // Build comprehensive snippet with all extracted info
                          const snippetParts = [
                            descMatch ? `Description: ${descMatch[1]}` : '',
                            breadcrumbs ? `Categories: ${breadcrumbs}` : '',
                            productDesc ? `Product Details: ${productDesc.substring(0, 500)}` : '',
                            productDetails ? `Specifications: ${productDetails.substring(0, 300)}` : '',
                            bulletPoints ? `Features: ${bulletPoints.substring(0, 300)}` : '',
                            priceMatch ? `Price: ${parseInt(priceMatch[1])/100}` : '',
                            skuMatch ? `SKU: ${skuMatch[1]}` : ''
                          ].filter(Boolean);

                          productData = {
                            title: titleMatch ? titleMatch[1] : '',
                            snippet: snippetParts.join('\n').trim(),
                            imageUrl: imageUrl
                          };
                        } else {
                          // Just a title
                          productData = {
                            title: addModelForm.pasteInput,
                            snippet: ''
                          };
                        }

                        // Parse with Claude
                        const parseResponse = await fetch('/api/admin/parse-product', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(productData)
                        });

                        const parseData = await parseResponse.json();

                        if (parseData.success) {
                          const extracted = parseData.data;

                          // Show verification modal with editable fields
                          setVerifyData({
                            manufacturer: extracted.manufacturer || '',
                            scale: extracted.scale || '',
                            sku: extracted.sku || '',
                            driver: extracted.driver || '',
                            eventName: extracted.event_name || '',
                            seasonYear: extracted.season_year?.toString() || '',
                            team: extracted.team || '',
                            chassis: extracted.chassis || '',
                            price: extracted.price?.toString() || '',
                            // Required by verifyData's type. Without it the
                            // production build fails type checking, even though
                            // this block sits after an earlier return.
                            currency: extracted.currency || 'AUD',
                            productUrl: addModelForm.pasteInput,
                          });
                          setVerifyModalOpen(true);
                          setSearchingCar(false);
                          return; // Stop here - modal will handle creation

                          // Step 1: Search for car (or create if doesn't exist)
                          const searchCarResponse = await fetch('/api/admin/search-car', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              year: extracted.season_year || 2024,
                              team: extracted.team || '',
                              chassis: extracted.chassis || '',
                            }),
                          });

                          const carData = await searchCarResponse.json();
                          let carId;

                          if (carData.success && carData.car) {
                            carId = carData.car.id;
                          } else {
                            // Car doesn't exist - warn user about potential duplicate chassis
                            const chassis = extracted.chassis || '';
                            const confirmCreate = confirm(
                              `⚠️ No car found for:\n` +
                              `${extracted.event_name || 'Event'} - ${chassis} - ${extracted.driver}\n\n` +
                              `This will create a NEW car entry.\n` +
                              `If a ${chassis} already exists for another driver/event, you'll have multiple ${chassis} entries.\n\n` +
                              `Continue?`
                            );

                            if (!confirmCreate) {
                              throw new Error('User cancelled car creation');
                            }

                            // Create the car
                            const createCarResponse = await fetch('/api/admin/create-car', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                year: extracted.season_year || 2024,
                                team: extracted.team || '',
                                chassis: extracted.chassis || `${extracted.team} ${extracted.season_year}`,
                              }),
                            });

                            const createCarData = await createCarResponse.json();
                            if (createCarData.success && createCarData.car) {
                              carId = createCarData.car.id;
                            } else {
                              throw new Error('Failed to create car');
                            }
                          }

                          // Step 2: Create the model
                          const createModelResponse = await fetch('/api/admin/create-model', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              carId: carId,
                              manufacturer: extracted.manufacturer || '',
                              scale: extracted.scale || '',
                              sku: extracted.sku || '',
                              driver: extracted.driver || '',
                              eventName: extracted.event_name || '',
                              price: extracted.price?.toString() || '',
                              imageUrl: productData.imageUrl || '', // Pass extracted image URL
                              retailerUrl: isUrl ? addModelForm.pasteInput : '', // Only pass URL if it's actually a URL
                            }),
                          });

                          const createModelData = await createModelResponse.json();

                          if (createModelData.success) {
                            alert(`✅ Model added successfully!\n\n${extracted.manufacturer} ${extracted.scale}\n${extracted.driver} - ${extracted.event_name}\n${extracted.season_year} ${extracted.team}`);

                            // Close modal and refresh data
                            setAddModelModalOpen(false);
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
                              pasteInput: '',
                            });

                            // Refresh F1 cars data
                            const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
                            const refreshData = await refreshResponse.json();
                            if (refreshData.success) {
                              setF1Cars(refreshData.cars);
                            }
                          } else {
                            alert('❌ Failed to create model: ' + createModelData.message);
                          }
                        } else {
                          alert('❌ Failed to extract product details: ' + parseData.error);
                        }
                      } catch (error: any) {
                        console.error('Error parsing product:', error);
                        alert('❌ Error: ' + error.message);
                      } finally {
                        setSearchingCar(false);
                      }
                    }}
                    disabled={searchingCar || !addModelForm.pasteInput}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-semibold"
                  >
                    {searchingCar ? '🔄 Processing...' : '🪄 Add to Database (AI-Powered)'}
                  </button>
                </div>
              </div>

              <div className="text-center text-[var(--text-secondary)] text-sm">
                OR fill manually below
              </div>

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
                      {searchedCar.season?.year} {searchedCar.team?.name} {searchedCar.chassis_name}
                      {searchedCar.event_name ? ` — ${searchedCar.event_name}` : ''}
                      {searchedCar.driver?.name ? ` — ${searchedCar.driver.name}` : ''}
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

      {/* Add Retailer Modal */}
      {addRetailerModalOpen && addRetailerModel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  ➕ Add Retailer Link
                </h2>
                <button
                  onClick={() => {
                    setAddRetailerModalOpen(false);
                    setAddRetailerUrl('');
                    setAddRetailerPrice('');
                    setAddRetailerName('');
                    setAddRetailerManualMode(false);
                    setAddRetailerModel(null);
                  }}
                  className="text-gray-500 hover:text-gray-900"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Adding retailer link for: <span className="font-semibold text-gray-900">{addRetailerModel.name}</span>
                  </p>

                  {/* Manual Mode Toggle */}
                  <label className="flex items-center gap-2 mb-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addRetailerManualMode}
                      onChange={(e) => setAddRetailerManualMode(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">
                      Manual entry (for sites with bot protection)
                    </span>
                  </label>

                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Retailer Product URL
                  </label>
                  <input
                    type="url"
                    value={addRetailerUrl}
                    onChange={(e) => setAddRetailerUrl(e.target.value)}
                    placeholder="https://example.com/products/..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {!addRetailerManualMode && (
                    <p className="text-xs text-gray-500 mt-2">
                      We'll automatically extract the price and details.
                    </p>
                  )}
                </div>

                {/* Manual Entry Fields */}
                {addRetailerManualMode && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        Retailer Name
                      </label>
                      <input
                        type="text"
                        value={addRetailerName}
                        onChange={(e) => setAddRetailerName(e.target.value)}
                        placeholder="e.g., Model Universe"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        Price (AUD)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={addRetailerPrice}
                        onChange={(e) => setAddRetailerPrice(e.target.value)}
                        placeholder="e.g., 389.99"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setAddRetailerModalOpen(false);
                      setAddRetailerUrl('');
                      setAddRetailerPrice('');
                      setAddRetailerName('');
                      setAddRetailerManualMode(false);
                      setAddRetailerModel(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addRetailer}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    Add Retailer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Car Modal */}
      {editCarModalOpen && editingCar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900">
                  ✏️ Edit Car
                </h2>
                <button
                  onClick={() => {
                    setEditCarModalOpen(false);
                    setEditingCar(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Car Info Display */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Editing:</p>
                <p className="text-lg font-semibold text-gray-900">
                  {editingCar.year} {editingCar.team} - {editingCar.chassis}
                </p>
              </div>

              {/* Livery Name Field */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Livery Name / Chassis
                </label>
                <input
                  type="text"
                  value={editCarForm.liveryName}
                  onChange={(e) => setEditCarForm({ ...editCarForm, liveryName: e.target.value })}
                  placeholder="e.g., W14, RB19, SF-23"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will update the car's chassis/livery name
                </p>
              </div>

              {/* Current Drivers */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Drivers
                </label>
                {editCarForm.drivers.length > 0 ? (
                  <div className="space-y-2">
                    {editCarForm.drivers.map((driver, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                        <span className="text-gray-900">{driver}</span>
                        <button
                          onClick={() => {
                            setEditCarForm({
                              ...editCarForm,
                              drivers: editCarForm.drivers.filter((_, i) => i !== idx)
                            });
                          }}
                          className="text-red-600 hover:text-red-700 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No drivers linked</p>
                )}
              </div>

              {/* Add Driver */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Add Driver
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editCarForm.newDriverName}
                    onChange={(e) => setEditCarForm({ ...editCarForm, newDriverName: e.target.value })}
                    placeholder="e.g., Lewis Hamilton"
                    className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && editCarForm.newDriverName.trim()) {
                        setEditCarForm({
                          ...editCarForm,
                          drivers: [...editCarForm.drivers, editCarForm.newDriverName.trim()],
                          newDriverName: ''
                        });
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (editCarForm.newDriverName.trim()) {
                        setEditCarForm({
                          ...editCarForm,
                          drivers: [...editCarForm.drivers, editCarForm.newDriverName.trim()],
                          newDriverName: ''
                        });
                      }
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setEditCarModalOpen(false);
                    setEditingCar(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/admin/update-car', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          carId: editingCar.id,
                          liveryName: editCarForm.liveryName,
                          drivers: editCarForm.drivers,
                        }),
                      });

                      const data = await response.json();

                      if (data.success) {
                        alert('✅ Car updated successfully!');
                        setEditCarModalOpen(false);
                        setEditingCar(null);
                        // Refresh data
                        const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
                        const refreshData = await refreshResponse.json();
                        if (refreshData.cars) {
                          setF1Cars(refreshData.cars);
                        }
                      } else {
                        alert('❌ Failed to update car: ' + data.message);
                      }
                    } catch (error) {
                      console.error('Error updating car:', error);
                      alert('❌ Error updating car');
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  💾 Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Model Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">
                  ✏️ Edit Model
                </h2>
                <button
                  onClick={() => {
                    setEditModalOpen(false);
                    setEditingModel(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();

                try {
                  const response = await fetch('/api/admin/update-model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      modelId: editData.modelId,
                      manufacturer: editData.manufacturer,
                      scale: editData.scale,
                      sku: editData.sku,
                      driver: editData.driver,
                      eventName: editData.eventName,
                      price: editData.price ? parseFloat(editData.price) : null,
                    }),
                  });

                  const data = await response.json();

                  if (data.success) {
                    alert('✅ Model updated successfully!');
                    setEditModalOpen(false);
                    setEditingModel(null);

                    // Refresh F1 data
                    const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
                    const refreshData = await refreshResponse.json();
                    if (refreshData.cars) {
                      setF1Cars(refreshData.cars);
                    }
                  } else {
                    // Duplicate SKU -> offer the merge flow.
                    // Branch on the `duplicate` flag, not on the wording of the
                    // error message (the old check sniffed for "duplicate key"
                    // and silently stopped working when the message changed).
                    if (data.duplicateModel && (data.duplicate || data.error?.includes('duplicate key'))) {
                      setDuplicateInfo(data.duplicateModel);
                      setDuplicateWarningOpen(true);
                    } else {
                      alert('❌ Failed to update model: ' + (data.details || data.error));
                    }
                  }
                } catch (error) {
                  console.error('Error updating model:', error);
                  alert('❌ Error updating model');
                }
              }}
              className="p-6"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Manufacturer *
                  </label>
                  <input
                    type="text"
                    required
                    value={editData.manufacturer}
                    onChange={(e) => setEditData({ ...editData, manufacturer: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Minichamps, Spark, Bburago"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scale *
                  </label>
                  <input
                    type="text"
                    required
                    value={editData.scale}
                    onChange={(e) => setEditData({ ...editData, scale: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., 1:43, 1:18"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SKU (Manufacturer Part Number)
                  </label>
                  <input
                    type="text"
                    value={editData.sku}
                    onChange={(e) => setEditData({ ...editData, sku: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., 417220144"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Driver
                  </label>
                  <input
                    type="text"
                    value={editData.driver}
                    onChange={(e) => setEditData({ ...editData, driver: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Lando Norris"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Name
                  </label>
                  <input
                    type="text"
                    value={editData.eventName}
                    onChange={(e) => setEditData({ ...editData, eventName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Bahrain GP, Miami GP"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Price (Optional)
                  </label>
                  <input
                    type="text"
                    value={editData.price}
                    onChange={(e) => setEditData({ ...editData, price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., 199.99"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setEditModalOpen(false);
                    setEditingModel(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                >
                  💾 Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Duplicate SKU Warning Modal */}
      {duplicateWarningOpen && duplicateInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="bg-orange-100 border-b border-orange-200 p-6">
              <div className="flex items-center gap-3">
                <span className="text-3xl">⚠️</span>
                <h2 className="text-2xl font-bold text-orange-900">
                  Duplicate SKU Detected
                </h2>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-700 mb-6">
                A model with SKU <span className="font-mono font-bold text-orange-600">{editData.sku}</span> already exists in the database.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Current Model Being Edited - KEEP */}
                <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50">
                  <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
                    <span>✅</span>
                    <span>Your Model (Will Keep)</span>
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-semibold text-gray-700">Old SKU:</span>
                      <span className="ml-2 font-mono text-red-600 line-through">{editingModel?.sku || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">New SKU:</span>
                      <span className="ml-2 font-mono text-green-600 font-bold">{editData.sku}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Manufacturer:</span>
                      <span className="ml-2">{editData.manufacturer}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Scale:</span>
                      <span className="ml-2">{editData.scale}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Driver:</span>
                      <span className="ml-2">{editData.driver}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Event:</span>
                      <span className="ml-2">{editData.eventName}</span>
                    </div>
                  </div>
                </div>

                {/* Old Existing Model - DELETE */}
                <div className="border-2 border-red-500 rounded-lg p-4 bg-red-50">
                  <h3 className="font-bold text-red-900 mb-3 flex items-center gap-2">
                    <span>🗑️</span>
                    <span>Old Model (Will Delete)</span>
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-semibold text-gray-700">SKU:</span>
                      <span className="ml-2 font-mono">{duplicateInfo.sku}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Manufacturer:</span>
                      <span className="ml-2">{duplicateInfo.manufacturer}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Scale:</span>
                      <span className="ml-2">{duplicateInfo.scale}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Driver:</span>
                      <span className="ml-2">{duplicateInfo.driver}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Event:</span>
                      <span className="ml-2">{duplicateInfo.eventName}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-900">
                  <strong>What will happen:</strong> The old model will be <strong>deleted</strong>,
                  and your current model's SKU will be updated to <strong className="font-mono">{editData.sku}</strong>. All your retailer links will be preserved!
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDuplicateWarningOpen(false);
                    setDuplicateInfo(null);
                  }}
                  className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold"
                >
                  Cancel (Go Back)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      // STEP 1: Transfer retailer links from OLD model to CURRENT model
                      console.log('🔄 Transferring retailer links from old model to current model...');
                      const transferResponse = await fetch('/api/admin/transfer-retailer-links', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          fromModelId: duplicateInfo.id,
                          toModelId: editData.modelId,
                        }),
                      });

                      const transferData = await transferResponse.json();
                      console.log(`✅ Transferred ${transferData.transferred || 0} retailer link(s)`);

                      // STEP 2: Delete the OLD model (the existing one with correct SKU)
                      const deleteResponse = await fetch('/api/admin/delete-model', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ modelId: duplicateInfo.id }),
                      });

                      const deleteData = await deleteResponse.json();

                      if (deleteData.success) {
                        // STEP 3: Update the current model with the correct SKU (no duplicate now)
                        const updateResponse = await fetch('/api/admin/update-model', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            modelId: editData.modelId,
                            manufacturer: editData.manufacturer,
                            scale: editData.scale,
                            sku: editData.sku, // The correct SKU
                            driver: editData.driver,
                            eventName: editData.eventName,
                            price: editData.price ? parseFloat(editData.price) : null,
                          }),
                        });

                        const updateResponseData = await updateResponse.json();

                        if (updateResponseData.success) {
                          const message = transferData.transferred > 0
                            ? `✅ Merged successfully! ${transferData.transferred} retailer link(s) combined + SKU updated!`
                            : '✅ Old model deleted and SKU updated successfully!';
                          alert(message);
                          setDuplicateWarningOpen(false);
                          setDuplicateInfo(null);
                          setEditModalOpen(false);
                          setEditingModel(null);

                          // Refresh F1 data
                          const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
                          const refreshData = await refreshResponse.json();
                          if (refreshData.cars) {
                            setF1Cars(refreshData.cars);
                          }
                        } else {
                          alert('❌ Failed to update SKU: ' + updateResponseData.error);
                        }
                      } else {
                        alert('❌ Failed to delete old model: ' + deleteData.message);
                      }
                    } catch (error) {
                      console.error('Error merging models:', error);
                      alert('❌ Error merging models');
                    }
                  }}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
                >
                  ✅ Merge: Keep Current & Update SKU
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Retailer Link Modal */}
      {editRetailerModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="bg-indigo-100 border-b border-indigo-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-indigo-900">
                  ✏️ Edit Retailer Link
                </h2>
                <button
                  onClick={() => {
                    setEditRetailerModalOpen(false);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();

                try {
                  const response = await fetch('/api/admin/update-retailer-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      priceHistoryId: editRetailerData.priceHistoryId,
                      price: parseFloat(editRetailerData.price),
                      currency: editRetailerData.currency,
                      inStock: editRetailerData.inStock,
                      productUrl: editRetailerData.productUrl,
                    }),
                  });

                  const data = await response.json();

                  if (data.success) {
                    alert('✅ Retailer link updated successfully!');
                    setEditRetailerModalOpen(false);

                    // Refresh F1 data
                    const refreshResponse = await fetch('/api/admin/get-f1-data', { cache: 'no-store' });
                    const refreshData = await refreshResponse.json();
                    if (refreshData.cars) {
                      setF1Cars(refreshData.cars);
                    }
                  } else {
                    alert('❌ Failed to update: ' + data.error);
                  }
                } catch (error) {
                  console.error('Error updating retailer link:', error);
                  alert('❌ Error updating retailer link');
                }
              }}
              className="p-6"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Retailer Name
                  </label>
                  <input
                    type="text"
                    value={editRetailerData.retailerName}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">Retailer name cannot be changed</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Price *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={editRetailerData.price}
                      onChange={(e) => setEditRetailerData({ ...editRetailerData, price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Currency
                    </label>
                    <select
                      value={editRetailerData.currency}
                      onChange={(e) => setEditRetailerData({ ...editRetailerData, currency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="AUD">AUD</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editRetailerData.inStock}
                      onChange={(e) => setEditRetailerData({ ...editRetailerData, inStock: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-gray-700">In Stock</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={editRetailerData.productUrl}
                    onChange={(e) => setEditRetailerData({ ...editRetailerData, productUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setEditRetailerModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                >
                  💾 Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DndContext>
  );
}
