'use client';

import { useState } from 'react';

interface ModelHeroProps {
  name: string;
  manufacturer: string;
  scale: string;
  material: string;
  priceRange: {
    low: number;
    high: number;
    currency: string;
  };
  images: {
    main: string;
    thumbnails: string[];
  };
}

export default function ModelHero({
  name,
  manufacturer,
  scale,
  material,
  priceRange,
  images,
}: ModelHeroProps) {
  const [selectedImage, setSelectedImage] = useState(0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
      {/* Left: Image Gallery */}
      <div>
        {/* Main Image */}
        <div className="aspect-[4/3] bg-[#efeee9] rounded-xl overflow-hidden mb-4 border border-[var(--border-light)]">
          {images.main || images.thumbnails[selectedImage] ? (
            <img
              src={images.main || images.thumbnails[selectedImage]}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
              <div className="text-center">
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-auto mb-3"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                <p className="text-sm">Product Image</p>
              </div>
            </div>
          )}
        </div>

        {/* Thumbnail Strip */}
        <div className="grid grid-cols-4 gap-3">
          {images.thumbnails.map((thumb, index) => (
            <button
              key={index}
              onClick={() => setSelectedImage(index)}
              className={`aspect-square bg-[#efeee9] rounded-lg overflow-hidden border-2 transition-all ${
                selectedImage === index
                  ? 'border-[var(--accent)]'
                  : 'border-[var(--border-light)] hover:border-[var(--border-medium)]'
              }`}
            >
              {thumb ? (
                <img src={thumb} alt={`View ${index + 1}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: Details */}
      <div>
        {/* Manufacturer Badge */}
        <div className="inline-flex items-center gap-2 bg-[var(--input-bg)] border border-[var(--border-default)] px-3 py-1.5 rounded-full mb-4">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{manufacturer}</span>
        </div>

        {/* Model Name */}
        <h1 className="font-display font-black text-4xl lg:text-5xl text-[var(--text-primary)] leading-tight mb-4">
          {name}
        </h1>

        {/* Scale & Material Pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="inline-flex items-center gap-1.5 bg-[var(--text-primary)] text-white px-4 py-2 rounded-lg font-semibold text-sm">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            {scale}
          </span>
          <span className="inline-flex items-center gap-1.5 bg-[var(--input-bg)] border border-[var(--border-default)] text-[var(--text-secondary)] px-4 py-2 rounded-lg font-semibold text-sm">
            {material}
          </span>
        </div>

        {/* Price Range */}
        <div className="mb-8">
          <p className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-2">
            Price Range
          </p>
          <p className="font-display font-black text-3xl text-[var(--text-primary)]">
            {priceRange.currency}
            {priceRange.low} — {priceRange.currency}
            {priceRange.high}
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-1">Based on recent listings</p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button className="w-full bg-[var(--accent)] text-white font-bold text-base px-6 py-4 rounded-xl hover:brightness-[0.92] transition-all flex items-center justify-center gap-2">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            Find Where to Buy
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button className="border-2 border-[var(--text-primary)] text-[var(--text-primary)] font-bold text-sm px-5 py-3 rounded-xl hover:bg-[var(--text-primary)] hover:text-white transition-all">
              Add to Collection
            </button>
            <button className="border-2 border-[var(--border-medium)] text-[var(--text-secondary)] font-bold text-sm px-5 py-3 rounded-xl hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center gap-2">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              Wishlist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
