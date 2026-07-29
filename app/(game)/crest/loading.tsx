import { Skeleton } from "@/components/ui/layout";

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-44" />
      </div>
      <Skeleton className="h-64 w-full rounded-3xl" />
    </div>
  );
}
