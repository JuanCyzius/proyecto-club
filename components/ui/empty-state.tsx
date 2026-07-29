import type { LucideIcon } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted">
          <Icon size={22} />
        </div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </CardBody>
    </Card>
  );
}
