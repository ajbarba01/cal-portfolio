// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { z } from "zod";
import { useAppForm } from "./use-app-form";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
});

describe("useAppForm", () => {
  it("validates with the zod schema and reports field errors", async () => {
    const { result } = renderHook(() => {
      const form = useAppForm(schema, { defaultValues: { name: "" } });
      // Read formState during render — RHF's proxy only re-renders subscribers.
      return { form, errors: form.formState.errors };
    });
    await act(async () => {
      await result.current.form.trigger();
    });
    expect(result.current.errors.name?.message).toBe("Name is required");
  });

  it("parses valid values through the schema on submit", async () => {
    const { result } = renderHook(() =>
      useAppForm(schema, { defaultValues: { name: "Kiche" } }),
    );
    let submitted: unknown;
    await act(async () => {
      await result.current.handleSubmit((v) => {
        submitted = v;
      })();
    });
    expect(submitted).toEqual({ name: "Kiche" });
  });
});
