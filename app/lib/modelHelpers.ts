import { ModelDetail } from './detailTypes';
import { MOCK_MODELS } from './mockData';

// Helper function to generate detailed model data from basic model
export function getModelDetails(id: string): ModelDetail | null {
  const baseModel = MOCK_MODELS.find((m) => m.id === id);
  if (!baseModel) return null;

  // Generate detailed data based on the base model
  return {
    id: baseModel.id,
    name: baseModel.name,
    manufacturer: baseModel.manufacturer,
    year: baseModel.year,
    driver: baseModel.driver || 'Unknown Driver',
    team: baseModel.team || 'Unknown Team',
    grandPrix: extractGPFromName(baseModel.name),
    scale: baseModel.scale || '1:43',
    material: baseModel.scale === '1:18' ? 'Resin' : 'Die-cast',
    articleNumber: `${baseModel.manufacturer.substring(0, 2).toUpperCase()}${baseModel.year}${baseModel.id.padStart(4, '0')}`,
    productionNumber: baseModel.scale === '1:18' ? 'Limited to 300 pieces' : 'Limited to 1000 pieces',
    releaseDate: baseModel.releaseDate || getReleaseDateByYear(baseModel.year),
    priceRange: extractPriceRange(baseModel.price),
    images: {
      main: baseModel.imageUrl || '',
      thumbnails: ['', '', '', ''],
    },
    priceHistory: generatePriceHistory(baseModel.price),
    retailers: generateRetailers(baseModel.price),
    rating: {
      average: Math.random() * 1.5 + 3.5, // 3.5-5.0
      count: Math.floor(Math.random() * 200) + 20, // 20-220
    },
    reviews: generateReviews(),
    relatedModels: generateRelatedModels(baseModel),
  };
}

function extractGPFromName(name: string): string {
  const gpMatch = name.match(/(?:Winner |-)([A-Za-z\s]+(?:GP|Grand Prix))/i);
  if (gpMatch) return gpMatch[1].trim();

  const yearMatch = name.match(/(\d{4})/);
  return yearMatch ? `Season ${yearMatch[1]}` : 'Championship';
}

function extractPriceRange(price?: string): { low: number; high: number; currency: string } {
  if (!price) return { low: 79, high: 99, currency: '€' };

  const priceNum = parseFloat(price.replace(/[€,]/g, ''));
  const currency = price.includes('€') ? '€' : '$';

  return {
    low: Math.round(priceNum * 0.9),
    high: Math.round(priceNum * 1.1),
    currency,
  };
}

function generatePriceHistory(price?: string): { month: string; price: number }[] {
  const basePrice = price ? parseFloat(price.replace(/[€,]/g, '')) : 85;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return months.map((month, index) => ({
    month,
    price: Math.round(basePrice + (Math.random() - 0.5) * 20),
  }));
}

function generateRetailers(price?: string): {
  name: string;
  price: number;
  currency: string;
  availability: 'In Stock' | 'Pre-order' | 'Out of Stock';
  url: string;
}[] {
  const basePrice = price ? parseFloat(price.replace(/[€,]/g, '')) : 85;

  return [
    {
      name: 'Spark Model Shop',
      price: Math.round(basePrice * 0.95),
      currency: '€',
      availability: 'Pre-order',
      url: 'https://sparkmodelshop.com',
    },
    {
      name: 'Frontline Hobbies',
      price: Math.round(basePrice),
      currency: '€',
      availability: 'In Stock',
      url: 'https://frontlinehobbies.com',
    },
    {
      name: 'Diecast Legends',
      price: Math.round(basePrice * 1.05),
      currency: '€',
      availability: 'In Stock',
      url: 'https://diecastlegends.com',
    },
    {
      name: 'eBay',
      price: Math.round(basePrice * 1.1),
      currency: '€',
      availability: 'In Stock',
      url: 'https://ebay.com',
    },
  ];
}

function generateReviews(): {
  id: string;
  username: string;
  rating: number;
  date: string;
  comment: string;
  verified: boolean;
}[] {
  const comments = [
    'Absolutely stunning detail on this piece. The paint finish is perfect and the proportions are spot on. Worth every penny.',
    'Beautiful model but the price is quite steep. The quality is there though - construction feels premium. Happy to have this in my collection.',
    'Great addition to my collection. The livery looks incredible. Only complaint is some minor details could be better, but overall very impressed.',
    'Excellent quality as expected from this manufacturer. Highly recommended for serious collectors.',
    'Good model overall, but I expected slightly better detail for the price point. Still a nice piece to own.',
  ];

  return comments.slice(0, 3).map((comment, index) => ({
    id: String(index + 1),
    username: ['F1Collector88', 'ScaleModelPro', 'TifosiBeast', 'RacingFanatic', 'ModelEnthusiast'][index],
    rating: Math.floor(Math.random() * 2) + 4, // 4 or 5 stars
    date: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
    comment,
    verified: index < 2, // First 2 are verified
  }));
}

function generateRelatedModels(baseModel: any): {
  id: string;
  name: string;
  manufacturer: string;
  scale: string;
  price: string;
  imageUrl?: string;
}[] {
  const related = [];

  // Same car, different scales
  if (baseModel.scale !== '1:43') {
    related.push({
      id: `${baseModel.id}-143`,
      name: `${baseModel.name.split(' - ')[0]} - ${baseModel.driver} - 1:43 Scale`,
      manufacturer: 'Spark',
      scale: '1:43',
      price: '€79.90',
    });
  }

  if (baseModel.scale !== '1:18') {
    related.push({
      id: `${baseModel.id}-118`,
      name: `${baseModel.name.split(' - ')[0]} - ${baseModel.driver} - 1:18 Scale`,
      manufacturer: 'Looksmart',
      scale: '1:18',
      price: '€249.00',
    });
  }

  if (baseModel.scale !== '1:64') {
    related.push({
      id: `${baseModel.id}-164`,
      name: `${baseModel.name.split(' - ')[0]} - ${baseModel.driver} - 1:64 Scale`,
      manufacturer: 'Spark',
      scale: '1:64',
      price: '€24.95',
    });
  }

  return related;
}

function getReleaseDateByYear(year: number): string {
  if (year >= 2024) return 'Q4 2024';
  if (year >= 2023) return 'Q2 2023';
  if (year >= 2020) return 'Q3 2021';
  return 'Released';
}
