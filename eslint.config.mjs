import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Design-system drift checks. Each entry tests a Tailwind class string (from a
 * `className`, a `cn()` / `cva()` / `clsx()` argument, or a hoisted constant)
 * for a hand-rolled pattern that should go through a primitive or token. See
 * docs/COMPONENT_SYSTEM.md.
 *
 * The three arrays differ only in which files they apply to, which is why they
 * are separate: `src/components/ui` is where the raw card and control shells
 * are legitimately authored, but a primitive composes the color, radius and
 * elevation tokens like everything else.
 */
const SHELL_CHECKS = [
  {
    test: (s) =>
      /\bbg-card\b/.test(s) &&
      /\brounded-(xl|2xl|3xl|card)\b/.test(s) &&
      /\bborder\b/.test(s),
    message:
      "Hand-rolled card surface — use <Surface> (variant plain/interactive/emphasis). See docs/COMPONENT_SYSTEM.md.",
  },
  {
    test: (s) =>
      /\bh-(8|9|11)\b/.test(s) &&
      /\brounded-(lg|control)\b/.test(s) &&
      /\bborder\b/.test(s),
    message:
      "Hand-rolled control shell — compose controlVariants / use the control primitive (control track).",
  },
];

/** Raw color values, wherever they are written. */
const COLOR_CHECKS = [
  {
    test: (s) =>
      /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/.test(s) ||
      /\b(bg|text|border|ring|fill|stroke)-\[(#|rgb|hsl)/.test(s),
    message:
      "Arbitrary color — reference a semantic token (e.g. bg-card, text-brand-strong), not a raw value.",
  },
  {
    test: (s) => /\bbg-(white|black)\b/.test(s),
    message:
      "Off-token fill (bg-white/bg-black) — use bg-card / bg-background.",
  },
];

/** Radius + elevation drift. */
const SURFACE_TOKEN_CHECKS = [
  {
    test: (s) =>
      /\brounded-(t-|b-|l-|r-|tl-|tr-|bl-|br-|s-|e-)?(xl|2xl|3xl)\b/.test(s),
    message:
      "Off-token surface radius — use rounded-card (or rounded-control). rounded-lg and below stay legal for rows that are not cards.",
  },
  {
    // An arbitrary shadow built out of a `var(--…)` token is the sanctioned
    // escape hatch (the nav underhang, the footer); a raw value is not.
    test: (s) =>
      /(?<![-\w])shadow-(sm|md|lg|xl|2xl)\b/.test(s) ||
      /(?<![-\w])shadow-\[(?![^\]]*var\(--)/.test(s),
    message:
      "Off-token elevation — use shadow-elev-1 / shadow-elev-2, or build the arbitrary value from a var(--…) token.",
  },
];

/**
 * Builds a rule that runs `checks` over every class string in a file: `className`
 * attributes, `cn()` / `cva()` / `clsx()` arguments, and the initializer of any
 * constant that holds a bare string (or, for the composed forms, whose name ends
 * in `Class` / `Classes`) — without that last visitor a string hoisted to a
 * module const is invisible to every check.
 */
const classStringRule = (description, checks) => ({
  meta: { type: "problem", docs: { description }, schema: [] },
  create(context) {
    const report = (value, node) => {
      if (typeof value !== "string") return;
      for (const check of checks) {
        if (check.test(value)) context.report({ node, message: check.message });
      }
    };
    const walk = (expr) => {
      if (!expr) return;
      switch (expr.type) {
        case "Literal":
          report(expr.value, expr);
          break;
        case "TemplateLiteral":
          expr.quasis.forEach((q) => report(q.value.cooked ?? q.value.raw, q));
          break;
        case "ConditionalExpression":
          walk(expr.consequent);
          walk(expr.alternate);
          break;
        case "LogicalExpression":
          walk(expr.left);
          walk(expr.right);
          break;
        case "ArrayExpression":
          expr.elements.forEach(walk);
          break;
        // A class map (`const FOO_CLASSES: Record<Tone, string> = { … }`) or
        // the `cn("…", { "rounded-3xl": on })` conditional form, where the
        // class string is the key rather than the value.
        case "ObjectExpression":
          expr.properties.forEach((p) => {
            if (p.type !== "Property") return;
            if (!p.computed && p.key.type === "Literal")
              report(p.key.value, p.key);
            walk(p.value);
          });
          break;
      }
    };
    return {
      JSXAttribute(node) {
        if (node.name.name !== "className" || !node.value) return;
        if (node.value.type === "Literal") report(node.value.value, node.value);
        else if (node.value.type === "JSXExpressionContainer")
          walk(node.value.expression);
      },
      CallExpression(node) {
        const name =
          node.callee.type === "Identifier" ? node.callee.name : null;
        if (name === "cn" || name === "cva" || name === "clsx")
          node.arguments.forEach(walk);
      },
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier" || !node.init) return;
        // A const holding a bare string is checked whatever it is called: the
        // hoisted class strings that motivated this visitor are named `control`,
        // `SECTION`, `ROVER_BAND` as often as `…Class`. The composed forms (a
        // map, an array, a ternary) still need the name to mark them, or every
        // string-keyed object in the codebase would be treated as class names.
        if (
          node.init.type === "Literal" ||
          node.init.type === "TemplateLiteral" ||
          /class(es)?$/i.test(node.id.name)
        )
          walk(node.init);
      },
    };
  },
});

/** Inline ESLint plugin: flags the drift patterns in class strings. */
const designSystem = {
  rules: {
    // The color half keeps the original `no-drift` name: the name is
    // load-bearing in the eslint-disable comments that already reference it,
    // and every one of those is a sanctioned raw color.
    "no-drift": classStringRule(
      "Flag arbitrary colors and off-token fills in class strings.",
      COLOR_CHECKS,
    ),
    "use-primitives": classStringRule(
      "Flag hand-rolled card and control surfaces in class strings.",
      SHELL_CHECKS,
    ),
    "surface-tokens": classStringRule(
      "Flag off-token radius and elevation classes — the card radius and the elevation scale are tokens.",
      SURFACE_TOKEN_CHECKS,
    ),
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "lib", pattern: "src/lib/**" },
        { type: "components", pattern: "src/components/**" },
        { type: "content", pattern: "src/content/**" },
        {
          type: "feature",
          pattern: "src/features/*",
          mode: "folder",
          capture: ["family"],
        },
      ],
      "boundaries/ignore": ["**/*.test.ts", "**/*.test.tsx"],
    },
    rules: {
      "boundaries/entry-point": [
        2,
        {
          default: "disallow",
          rules: [
            {
              // `index.ts` is the server entry, `index.client.ts` the
              // client-safe one. Every feature gets exactly these two.
              target: ["feature"],
              allow: ["index.ts", "index.client.ts"],
            },
            {
              // Booking alone gets three more, and only these three: the static
              // marketing routes read the service catalogue and nothing else,
              // and reaching it through `booking/index.ts` would pull the whole
              // booking server graph (the repository, Stripe, Resend) into
              // their build. `meet-greet-upcoming.ts` is the same trade on the
              // client side: it is a pure predicate, and reaching it through
              // `booking/index.client.ts` pulls the Scheduler (and with it
              // react-day-picker + date-fns) into every bundle that transitively
              // touches the admin client barrel — the site header does, so that
              // is every public page. Later rules win, so this widens the entry
              // above for the booking family only. See docs/adr/0002.
              target: [["feature", { family: "booking" }]],
              allow: [
                "index.ts",
                "index.client.ts",
                "services-repo.ts",
                "service-card-display.ts",
                "meet-greet-upcoming.ts",
              ],
            },
            {
              target: ["lib", "components", "app", "content"],
              allow: "**",
            },
          ],
        },
      ],
      // Layer direction. `lib` is business-agnostic infrastructure and
      // `components` is the design system, so neither may reach a domain
      // feature, a route, or (for lib) the design system: a dependency that
      // way round is the layer being used as a dumping ground. Cal-owned copy
      // in `src/content` is data — it imports nothing.
      "boundaries/element-types": [
        2,
        {
          default: "allow",
          rules: [
            {
              from: ["lib"],
              disallow: ["feature", "app", "components"],
              message:
                "lib is business-agnostic infrastructure — it must not import ${dependency.type}. Invert the dependency, or move the module into the feature that owns it.",
            },
            {
              from: ["components"],
              disallow: ["feature", "app"],
              message:
                "src/components is the design system — it must not import ${dependency.type}. Take the data as a prop, or move the component into the feature.",
            },
            {
              from: ["content"],
              disallow: ["feature", "app", "components", "lib"],
              message:
                "src/content is Cal-owned copy — it is data and imports nothing.",
            },
          ],
        },
      ],
      // Allow intentionally-unused vars/args/rest-siblings when prefixed with `_`
      // (the conventional "discard" marker) — removes the need for per-site
      // eslint-disable comments on required-but-unused destructures.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Hand-rolled card / control shells. Excludes the primitive definitions
  // themselves (src/components/ui) and the showcase demos, which legitimately
  // author the raw patterns.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/components/ui/**",
      "src/app/showcase/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    plugins: { "design-system": designSystem },
    rules: { "design-system/use-primitives": "error" },
  },
  // Color, radius and elevation. Unlike the check above, these cover
  // `src/components/ui` — a primitive may author the raw shell, but it
  // composes the tokens like everything else.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/app/showcase/**",
      // Rendered outside a browser, where CSS custom properties do not exist:
      // Satori (ImageResponse) reads `style={{}}`, email clients read inline
      // HTML. Both mirror the tokens as raw hex by necessity, and neither file
      // holds a class string for these checks to inspect.
      "src/app/opengraph-image.tsx",
      "src/features/notifications/emails.ts",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    plugins: { "design-system": designSystem },
    rules: {
      "design-system/no-drift": "error",
      "design-system/surface-tokens": "error",
    },
  },
  // Not yet migrated onto the radius/elevation tokens. Most are floating
  // elements whose shadow predates the elevation scale — COMPONENT_SYSTEM.md
  // sanctions the drop-shadow on those, not the raw value it is written with.
  // Warn until each moves onto `rounded-card` / `shadow-elev-*`, then delete its
  // line; an empty list means this whole block goes.
  {
    files: [
      "src/components/layout/header-menu.tsx",
      "src/components/layout/page-shell.tsx",
      "src/components/site-nav.tsx",
      "src/components/ui/back-to-top.tsx",
      "src/components/ui/multiswitch.tsx",
      "src/components/ui/select.tsx",
      "src/features/booking/_components/scheduler/day-timeline.tsx",
    ],
    plugins: { "design-system": designSystem },
    rules: { "design-system/surface-tokens": "warn" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
