export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="shimmer h-9 w-64 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="shimmer h-32 rounded-2xl" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="shimmer h-72 rounded-2xl xl:col-span-2" />
        <div className="shimmer h-72 rounded-2xl" />
      </div>
    </div>
  );
}
