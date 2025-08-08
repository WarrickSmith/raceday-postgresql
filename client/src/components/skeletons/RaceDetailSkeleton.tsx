export function RaceDetailSkeleton() {
  return (
    <main className="container mx-auto px-4 py-8" role="main">
      <div className="max-w-4xl mx-auto animate-pulse">
        {/* Race Header Skeleton */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-4 bg-gray-200 rounded w-8"></div>
              <div className="h-4 bg-gray-200 rounded w-1"></div>
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-4 bg-gray-200 rounded w-1"></div>
              <div className="h-4 bg-gray-200 rounded w-12"></div>
            </div>
            
            <div className="h-8 bg-gray-200 rounded w-80 mb-2"></div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center">
                <div className="h-4 bg-gray-200 rounded w-16"></div>
                <div className="ml-2 h-4 bg-gray-200 rounded w-20"></div>
              </div>
              
              <div className="flex items-center">
                <div className="h-4 bg-gray-200 rounded w-12"></div>
                <div className="ml-2 h-6 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Race Details Skeleton */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="h-4 bg-blue-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-blue-200 rounded w-4/5"></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}