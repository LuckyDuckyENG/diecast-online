import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://diecasts.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // Admin tooling — nothing here is for the public
        '/admin',
        '/api/',
        // Search result pages are the textbook case of thin, near-duplicate
        // content: infinite URL variants, all assembled from pages that are
        // already indexed on their own.
        '/search',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
