import { Skeleton } from "@/components/states";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-4 w-full max-w-[40rem]" />
      <div className="space-y-3 pt-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
