interface Review {
  id: string;
  username: string;
  rating: number;
  date: string;
  comment: string;
  verified: boolean;
}

interface CollectorReviewsProps {
  rating: {
    average: number;
    count: number;
  };
  reviews: Review[];
}

function StarRating({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={sizeClasses[size]}
          viewBox="0 0 24 24"
          fill={star <= rating ? 'var(--accent)' : 'none'}
          stroke={star <= rating ? 'var(--accent)' : 'var(--border-medium)'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

export default function CollectorReviews({ rating, reviews }: CollectorReviewsProps) {
  // If no reviews, show empty state
  if (!reviews || reviews.length === 0) {
    return (
      <section className="mb-16">
        <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mb-6">
          Collector Reviews
        </h2>
        <div className="bg-white border border-[var(--border-light)] rounded-xl p-8 text-center">
          <div className="mb-4">
            <StarRating rating={0} size="lg" />
          </div>
          <p className="text-[var(--text-tertiary)] mb-4">No reviews yet. Be the first to review this model!</p>
          <button className="bg-[var(--text-primary)] text-white font-bold text-sm px-6 py-3 rounded-lg hover:bg-[var(--accent)] transition-all">
            Add Your Review
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-16">
      <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mb-6">
        Collector Reviews
      </h2>

      <div className="bg-white border border-[var(--border-light)] rounded-xl p-8">
        {/* Overall Rating */}
        <div className="flex items-center gap-6 pb-8 mb-8 border-b border-[var(--border-light)]">
          <div className="text-center">
            <div className="font-display font-black text-5xl text-[var(--text-primary)] mb-2">
              {rating.average}
            </div>
            <StarRating rating={Math.round(rating.average)} size="lg" />
            <p className="text-sm text-[var(--text-muted)] mt-2">{rating.count} reviews</p>
          </div>

          <div className="flex-1">
            <p className="text-[var(--text-secondary)] mb-4">
              Based on verified collectors and enthusiasts
            </p>
            <button className="bg-[var(--text-primary)] text-white font-bold text-sm px-6 py-3 rounded-lg hover:bg-[var(--accent)] transition-all">
              Add Your Review
            </button>
          </div>
        </div>

        {/* Review List */}
        <div className="space-y-6">
          {reviews.map((review) => (
            <div key={review.id} className="pb-6 border-b border-[var(--border-light)] last:border-0 last:pb-0">
              <div className="flex items-start gap-4">
                {/* Avatar Placeholder */}
                <div className="w-12 h-12 rounded-full bg-[var(--section-bg)] flex items-center justify-center flex-none">
                  <span className="font-display font-bold text-[var(--text-tertiary)] text-lg">
                    {review.username.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Review Content */}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-[var(--text-primary)]">{review.username}</h4>
                        {review.verified && (
                          <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Verified
                          </span>
                        )}
                      </div>
                      <StarRating rating={review.rating} size="sm" />
                    </div>
                    <span className="text-sm text-[var(--text-muted)]">
                      {new Date(review.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="text-[var(--text-secondary)] leading-relaxed">{review.comment}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Show More Button */}
        {reviews.length < rating.count && (
          <div className="text-center mt-8 pt-6 border-t border-[var(--border-light)]">
            <button className="text-[var(--accent)] font-semibold text-sm hover:underline">
              Show all {rating.count} reviews →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
