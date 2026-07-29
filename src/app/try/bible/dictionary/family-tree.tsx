"use client";

/**
 * A compact family diagram for one person: parents on top, the person (with any
 * partners) in the middle, children below, and siblings listed after. Every
 * named relative that resolves to a dictionary article is a button that opens
 * it; the rest render as plain muted chips.
 */
import type { PersonRel, PersonRelations } from "@/lib/content/people";

const UNCERTAIN_NOTE = "traditional identification, not stated in the biblical text";

function Chip({
  node,
  onOpen,
  self = false,
}: {
  node: PersonRel;
  onOpen: (id: string) => void;
  self?: boolean;
}) {
  const base =
    "inline-block max-w-[10rem] truncate rounded-full px-3 py-1 text-sm";
  const dashed = node.q ? " border-dashed" : "";
  const label = node.q ? `${node.n}?` : node.n;
  const title = node.q ? `${node.n} — ${UNCERTAIN_NOTE}` : node.n;
  if (self) {
    return (
      <span className={`${base} bg-amber-500 font-semibold text-white`} title={node.n}>
        {node.n}
      </span>
    );
  }
  if (node.id) {
    return (
      <button
        onClick={() => onOpen(node.id!)}
        className={`${base}${dashed} cursor-pointer border border-amber-300 bg-amber-50 font-medium text-amber-800 transition-colors hover:border-amber-500 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40`}
        title={title}
      >
        {label}
      </button>
    );
  }
  return (
    <span
      className={`${base}${dashed} border border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400`}
      title={title}
    >
      {label}
    </span>
  );
}

/** A short centered vertical connector between tiers. */
function Connector() {
  return <div className="mx-auto h-4 w-px bg-neutral-300 dark:bg-neutral-700" />;
}

/** A centered, wrapping row of chips. */
function Row({
  nodes,
  onOpen,
}: {
  nodes: PersonRel[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {nodes.map((n, i) => (
        <Chip key={`${n.id ?? n.n}-${i}`} node={n} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function FamilyTree({
  name,
  rel,
  onOpen,
}: {
  name: string;
  rel: PersonRelations;
  onOpen: (id: string) => void;
}) {
  const parents = [rel.f, rel.m].filter(Boolean) as PersonRel[];
  const partners = rel.par ?? [];
  const offspring = rel.off ?? [];
  const siblings = rel.sib ?? [];
  const anyUncertain = [...parents, ...partners, ...offspring, ...siblings].some(
    (n) => n.q,
  );

  return (
    <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-5 dark:border-neutral-800 dark:bg-neutral-900/40">
      {parents.length > 0 && (
        <>
          {/* Father ═ mother — the same couple sign the partner row uses. */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {parents.map((p, i) => (
              <span key={`par-${i}`} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="text-neutral-400" aria-hidden>
                    ═
                  </span>
                )}
                <Chip node={p} onOpen={onOpen} />
              </span>
            ))}
          </div>
          <Connector />
        </>
      )}

      {/* The person, with any partners alongside: one couple sign, then the
          partners as a ·-separated list — a ═ between adjacent partners would
          read as the partners married to each other (Lamech ═ Adah ═ Zillah). */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Chip node={{ n: name }} onOpen={onOpen} self />
        {partners.map((p, i) => (
          <span key={`p-${i}`} className="flex items-center gap-2">
            <span className="text-neutral-400" aria-hidden>
              {i === 0 ? "═" : "·"}
            </span>
            <Chip node={p} onOpen={onOpen} />
          </span>
        ))}
      </div>

      {offspring.length > 0 && (
        <>
          <Connector />
          <Row nodes={offspring} onOpen={onOpen} />
        </>
      )}

      {siblings.length > 0 && (
        <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-neutral-400">
            Brothers &amp; sisters
          </p>
          <Row nodes={siblings} onOpen={onOpen} />
        </div>
      )}

      {anyUncertain && (
        <p className="mt-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
          ? — {UNCERTAIN_NOTE}
        </p>
      )}
    </div>
  );
}
