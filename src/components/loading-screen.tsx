/** Simple full-height loading state used while offline content is read from the bundle. */
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-neutral-500">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
