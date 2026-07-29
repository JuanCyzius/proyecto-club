import { PitchBackdrop } from "@/components/brand/pitch-backdrop";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col justify-center overflow-hidden">
      <div className="relative h-40 shrink-0">
        <PitchBackdrop />
      </div>
      <div className="app-shell -mt-16 pb-16">{children}</div>
    </main>
  );
}
