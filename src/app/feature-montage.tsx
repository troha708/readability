import Image from "next/image";

/**
 * The pictures beside the "What's in it" list: one per bullet, in the same
 * order, so a tile and its sentence read as a pair.
 *
 * Each is a capture of the real component rather than an illustration of it —
 * scripts/shoot-features.mjs drives the app and shoots them, and re-running it
 * is how they stay current. The intrinsic sizes below are what that script
 * emitted; they are the crop's own 16:10, not a resize.
 */
const TILES = [
  {
    src: "/landing/verse-tools.png",
    w: 1344,
    h: 840,
    alt: "The verse sheet open on John 1:4: highlight colours, Note and Copy, then study notes, cross-references and the Greek word by word",
  },
  {
    src: "/landing/overview.png",
    w: 1344,
    h: 840,
    alt: "The introduction to John, giving its purpose, author, date and setting",
  },
  {
    src: "/landing/dictionary.png",
    w: 1472,
    h: 920,
    alt: "The dictionary article on Bethlehem, its prose linked through to the people and places it names",
  },
  {
    src: "/landing/chapter-map.png",
    w: 1344,
    h: 840,
    alt: "The map for John 2, marking Cana, Capernaum and Jerusalem around the Sea of Galilee",
  },
  {
    src: "/landing/search.png",
    w: 1024,
    h: 640,
    alt: "A search for “living water” returning fourteen verses with the words highlighted",
  },
  {
    src: "/landing/quiz.png",
    w: 1416,
    h: 885,
    alt: "A comprehension question on the opening of John's Gospel with four answers to choose from",
  },
];

export function FeatureMontage({ className = "" }: { className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      {TILES.map((t) => (
        <Image
          key={t.src}
          src={t.src}
          alt={t.alt}
          width={t.w}
          height={t.h}
          // Two columns of a 30rem block on desktop, two columns of the
          // viewport below it — never more than ~235px either way, so the
          // browser is told that rather than left to assume full width.
          sizes="(min-width: 34rem) 235px, 45vw"
          className="w-full rounded-[3px] border border-neutral-800 bg-neutral-900"
        />
      ))}
    </div>
  );
}
