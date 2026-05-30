/**
 * Gallery page — photo grid with placeholder images.
 * Server component.
 */

import Image from "next/image";

const photos = [
  { seed: 1, alt: "Dog on a trail walk in Colorado" },
  { seed: 2, alt: "Golden retriever enjoying outdoor time" },
  { seed: 3, alt: "Happy dog running in an open field" },
  { seed: 4, alt: "Dog resting comfortably during a house sit" },
  { seed: 5, alt: "Labrador splashing in a mountain creek" },
  { seed: 6, alt: "Dog and sitter on a neighborhood walk" },
  { seed: 7, alt: "Two dogs playing in the yard" },
  { seed: 8, alt: "Dog looking out the window during a house sit" },
];

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      {/* TODO: real portfolio photos before launch */}
      <header className="mb-10">
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          Gallery
        </h1>
        <p className="text-muted-foreground mt-2 leading-relaxed"></p>
      </header>

      <ul
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        role="list"
      >
        {photos.map(({ seed, alt }) => (
          <li key={seed} className="overflow-hidden rounded-lg">
            <Image
              src={`https://picsum.photos/seed/${seed}/600/400`}
              alt={alt}
              width={600}
              height={400}
              loading="lazy"
              className="h-auto w-full object-cover transition-opacity duration-300"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
