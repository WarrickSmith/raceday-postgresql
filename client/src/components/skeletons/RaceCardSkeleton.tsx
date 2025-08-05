interface RaceCardSkeletonProps {
  count?: number;
}

export function RaceCardSkeleton() {
  return (
    <div className="border-l-4 border-gray-200 bg-white p-4 animate-pulse">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
          <div className="h-4 bg-gray-200 rounded w-32"></div>
        </div>
        <div className="h-6 bg-gray-200 rounded w-16"></div>
      </div>
      
      <div className="flex items-center justify-between text-xs">
        <div className="h-3 bg-gray-200 rounded w-20"></div>
        <div className="h-3 bg-gray-200 rounded w-12"></div>
      </div>
    </div>
  );
}

export function RaceCardListSkeleton({ count = 5 }: RaceCardSkeletonProps) {
  return (
    <div className="space-y-2" data-testid="races-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <RaceCardSkeleton key={i} />
      ))}
    </div>
  );
}