import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Design-system drift checks. Each entry tests a Tailwind class string (from a
 * `className`, or a `cn()` / `cva()` / `clsx()` argument) for a hand-rolled
 * pattern that should go through a primitive or token. See docs/COMPONENT_SYSTEM.md.
 */
const CLASS_CHECKS = [
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

/** Inline ESLint plugin: flags the drift patterns in class strings. */
const designSystem = {
  rules: {
    "no-drift": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Flag hand-rolled card/control surfaces, arbitrary colors, and off-token fills in class strings.",
        },
        schema: [],
      },
      create(context) {
        const report = (value, node) => {
          if (typeof value !== "string") return;
          for (const check of CLASS_CHECKS) {
            if (check.test(value))
              context.report({ node, message: check.message });
          }
        };
        const walk = (expr) => {
          if (!expr) return;
          switch (expr.type) {
            case "Literal":
              report(expr.value, expr);
              break;
            case "TemplateLiteral":
              expr.quasis.forEach((q) =>
                report(q.value.cooked ?? q.value.raw, q),
              );
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
          }
        };
        return {
          JSXAttribute(node) {
            if (node.name.name !== "className" || !node.value) return;
            if (node.value.type === "Literal")
              report(node.value.value, node.value);
            else if (node.value.type === "JSXExpressionContainer")
              walk(node.value.expression);
          },
          CallExpression(node) {
            const name =
              node.callee.type === "Identifier" ? node.callee.name : null;
            if (name === "cn" || name === "cva" || name === "clsx")
              node.arguments.forEach(walk);
          },
        };
      },
    },
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
            { target: ["feature"], allow: ["index.ts", "index.client.ts"] },
            { target: ["lib", "components", "app"], allow: "**" },
          ],
        },
      ],
      "boundaries/element-types": [2, { default: "allow" }],
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
  // Design-system drift checks (warn). Excludes the primitive definitions
  // themselves (src/components/ui) and the showcase demos, which legitimately
  // author the raw patterns. Starts at `warn`; tightened to `error` per zone as
  // each is migrated onto the system.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/components/ui/**",
      "src/app/showcase/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    plugins: { "design-system": designSystem },
    rules: { "design-system/no-drift": "warn" },
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
