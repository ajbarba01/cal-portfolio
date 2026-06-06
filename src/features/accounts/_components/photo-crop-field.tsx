"use client";

/**
 * PhotoCropField — dependency-free circular photo picker + crop.
 *
 * Pick a file (click or drag-drop) → pan/zoom it inside a circular viewport →
 * "Use photo" bakes the visible circle into a square canvas and hands the caller
 * a cropped Blob to upload. Avatars render as CSS circles everywhere, so the
 * baked square crop displays consistently.
 *
 * Pure-DOM, no new dependency: cover-fit math + pointer pan + a zoom range; the
 * crop is rendered with a single ctx.drawImage source-rect → 512² canvas.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const VIEW = 240; // circular editor viewport (px)
const OUT = 512; // exported square edge (px)
const MAX_ZOOM = 3;

interface PhotoCropFieldProps {
  /** Called with the cropped square Blob (or null if cleared). */
  onCroppedBlobChange: (blob: Blob | null) => void;
}

export function PhotoCropField({ onCroppedBlobChange }: PhotoCropFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);

  const [src, setSrc] = useState<string | null>(null); // object URL being edited
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [preview, setPreview] = useState<string | null>(null); // committed crop

  // Revoke the editing object URL when it changes or on unmount (cleanup-only).
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const baseScale = nat ? Math.max(VIEW / nat.w, VIEW / nat.h) : 1;
  const scale = baseScale * zoom;
  const dispW = nat ? nat.w * scale : VIEW;
  const dispH = nat ? nat.h * scale : VIEW;

  const clampOffset = useCallback(
    (o: { x: number; y: number }) => ({
      x: Math.min(0, Math.max(VIEW - dispW, o.x)),
      y: Math.min(0, Math.max(VIEW - dispH, o.y)),
    }),
    [dispW, dispH],
  );

  function loadFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgElRef.current = img;
      const b = Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight);
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
      setZoom(1);
      setOffset({
        x: (VIEW - img.naturalWidth * b) / 2,
        y: (VIEW - img.naturalHeight * b) / 2,
      });
    };
    img.src = url;
    setSrc(url); // previous src revoked by the cleanup effect
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!nat) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  }
  function handlePointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setOffset(
      clampOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }),
    );
  }
  function handlePointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  function handleZoom(z: number) {
    // Keep the viewport center fixed while zooming.
    const c = VIEW / 2;
    const prev = baseScale * zoom;
    const next = baseScale * z;
    const imgX = (c - offset.x) / prev;
    const imgY = (c - offset.y) / prev;
    setZoom(z);
    setOffset(clampOffset({ x: c - imgX * next, y: c - imgY * next }));
  }

  function useThisPhoto() {
    const img = imgElRef.current;
    if (!img || !nat) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sSize = VIEW / scale;
    ctx.drawImage(
      img,
      -offset.x / scale,
      -offset.y / scale,
      sSize,
      sSize,
      0,
      0,
      OUT,
      OUT,
    );
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCroppedBlobChange(blob);
        setPreview(URL.createObjectURL(blob)); // previous revoked by cleanup
        setSrc(null); // collapse editor
      },
      "image/jpeg",
      0.9,
    );
  }

  function reset() {
    onCroppedBlobChange(null);
    setPreview(null);
    setSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={(e) => loadFile(e.target.files?.[0])}
    />
  );

  // ── Editing: circular pan/zoom viewport ───────────────────────────────────
  if (src) {
    return (
      <div className="flex flex-col items-start gap-3">
        {hiddenInput}
        <div
          className="border-border relative size-60 cursor-grab touch-none overflow-hidden rounded-full border active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- object-URL crop source, not a remote asset */}
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              width: dispW,
              height: dispH,
              left: offset.x,
              top: offset.y,
            }}
          />
          {/* subtle inner ring to read the crop edge */}
          <div className="ring-foreground/10 pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset" />
        </div>

        <label className="flex w-60 items-center gap-2">
          <span className="text-muted-foreground text-xs">Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoom(parseFloat(e.target.value))}
            className="accent-brand h-1 flex-1"
            aria-label="Zoom"
          />
        </label>

        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={useThisPhoto}>
            <Check className="size-4" aria-hidden="true" />
            Use photo
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Committed crop preview ─────────────────────────────────────────────────
  if (preview) {
    return (
      <div className="flex items-center gap-4">
        {hiddenInput}
        {/* eslint-disable-next-line @next/next/no-img-element -- local cropped blob preview */}
        <img
          src={preview}
          alt="Selected pet photo"
          className="border-border size-16 rounded-full border object-cover"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            Replace photo
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={reset}
          >
            Remove
          </Button>
        </div>
      </div>
    );
  }

  // ── Empty: dashed dropzone ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-start gap-1.5">
      {hiddenInput}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          loadFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "border-border text-muted-foreground hover:border-brand/40 hover:text-brand-strong hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed px-4 py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
        )}
      >
        <ImagePlus className="size-4" aria-hidden="true" />
        Add a photo
      </button>
    </div>
  );
}
