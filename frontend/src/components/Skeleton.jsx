export function Skeleton({ className = '', style, ...props }) {
  return (
    <div
      className={`animate-shimmer rounded-xl ${className}`}
      style={style}
      aria-hidden="true"
      {...props}
    />
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card ${className}`}>
      <Skeleton className="h-6 w-24 mb-4" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

export function SkeletonTableRow({ columns = 6 }) {
  return (
    <tr>
      {Array.from({ length: columns }, (_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonChart({ className = '' }) {
  return (
    <div className={`card p-6 ${className}`}>
      <Skeleton className="h-5 w-40 mb-4" />
      <Skeleton className="h-64 w-full rounded" />
    </div>
  );
}