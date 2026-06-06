import Link from "next/link";
import Image from "next/image";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Home hero: a 3:2 photo with the headline overlaid on desktop and stacked
 * beneath on mobile (where overlaying a short 3:2 band is unreadable). One
 * <h1>; colors + position flip at the `sm` breakpoint.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative">
      <div className="relative aspect-[3/2] w-full">
        <Image
          src="/bg/IMG_7869.JPG"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="from-foreground/70 via-foreground/30 absolute inset-0 hidden bg-gradient-to-r to-transparent sm:block" />
      </div>

      <div className="px-5 py-8 sm:absolute sm:inset-0 sm:flex sm:flex-col sm:justify-center sm:px-8 sm:py-0 lg:px-16">
        <div className="flex max-w-[42ch] flex-col items-start gap-5 sm:max-w-[60%]">
          <Eyebrow className="sm:text-[var(--sand-50)]">
            Dog walking · house sitting · Colorado
          </Eyebrow>
          <h1
            id="hero-heading"
            className="font-heading text-foreground max-w-[18ch] text-4xl leading-[1.04] font-semibold tracking-tight sm:text-5xl sm:text-white lg:text-6xl"
          >
            [[HEADER: hero hook]]
          </h1>
          <p className="text-muted-foreground max-w-[42ch] leading-relaxed sm:text-white/85">
            [[BODY: services overview and what sets Cal apart]]
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/book"
              className={cn(
                buttonVariants({ variant: "brand", size: "lg" }),
                "w-full sm:w-auto",
              )}
            >
              Book a service
            </Link>
            <Link
              href="/services"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full sm:w-auto",
              )}
            >
              See services
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
