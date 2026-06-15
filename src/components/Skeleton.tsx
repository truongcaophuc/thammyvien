/**
 * Skeleton primitive — placeholder pulse trong khi data đang load.
 * Match layout của content thật để tránh layout shift khi data về.
 *
 * Dùng:
 *   <Skeleton className="h-4 w-32" />        // 1 dòng text
 *   <Skeleton className="h-12 w-12 rounded-full" />  // avatar
 *   <SkeletonCard>{...}</SkeletonCard>       // wrapper card có sẵn shadow
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} />;
}

export function SkeletonCard({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-card ${className}`}>
      {children}
    </div>
  );
}
