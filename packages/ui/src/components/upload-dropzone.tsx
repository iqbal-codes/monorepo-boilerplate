/**
 * UploadDropzone — file/image picker with drag-and-drop, progress, and preview.
 *
 * Transport-agnostic: the `upload` callback owns the network call, so the same
 * block works with the bundled local-disk endpoint
 * (`POST /uploads`, see apps/server/src/routes/uploads.ts) or presigned S3
 * (docs/adr/0004). The block reports progress through `onProgress` and honours
 * an `AbortSignal` for cancellation.
 *
 * Controlled and uncontrolled: pass `value` to control the URL, or omit it and
 * the block keeps the last uploaded URL itself.
 */
import * as React from "react";
import { cn } from "cn";
import { ImageIcon, Loader2Icon, Trash2Icon, UploadCloudIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Progress } from "@monorepo-boilerplate/ui/components/progress";

export type UploadResult = { url: string };

export type UploadHandler = (
  file: File,
  options: {
    /** 0–1, or a byte count when `total` is known. */
    onProgress: (fraction: number) => void;
    signal: AbortSignal;
  },
) => Promise<UploadResult>;

type UploadDropzoneProps = {
  upload: UploadHandler;
  /** Current file URL. Omit for uncontrolled use. */
  value?: string | null;
  onValueChange?: (url: string | null) => void;
  onError?: (error: Error) => void;
  accept?: string;
  /** Images render a preview thumbnail instead of a file row. */
  variant?: "file" | "image";
  maxSizeBytes?: number;
  disabled?: boolean;
  className?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
};

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

export function UploadDropzone({
  upload,
  value,
  onValueChange,
  onError,
  accept = "image/*",
  variant = "image",
  maxSizeBytes = DEFAULT_MAX_SIZE,
  disabled = false,
  className,
  label,
  hint,
}: UploadDropzoneProps) {
  const [internalUrl, setInternalUrl] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const url = value !== undefined ? value : internalUrl;

  const setUrl = React.useCallback(
    (next: string | null) => {
      if (value === undefined) setInternalUrl(next);
      onValueChange?.(next);
    },
    [value, onValueChange],
  );

  React.useEffect(() => () => abortRef.current?.abort(), []);

  async function start(file: File) {
    setLocalError(null);

    if (file.size > maxSizeBytes) {
      const message = `File is larger than ${Math.round(maxSizeBytes / 1024 / 1024)} MB`;
      setLocalError(message);
      onError?.(new Error(message));
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(0);

    try {
      const result = await upload(file, {
        onProgress: (fraction) =>
          setProgress(Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))),
        signal: controller.signal,
      });
      setProgress(null);
      setUrl(result.url);
    } catch (cause) {
      setProgress(null);
      if (controller.signal.aborted) return;
      const error = cause instanceof Error ? cause : new Error("Upload failed");
      setLocalError(error.message);
      onError?.(error);
    }
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void start(file);
  }

  const isUploading = progress !== null;
  const error = localError;

  return (
    <div data-slot="upload-dropzone" className={cn("flex flex-col gap-2", className)}>
      {label ? <p className="text-sm font-medium">{label}</p> : null}

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || isUploading}
        aria-label="Choose a file or drop it here"
        onClick={() => {
          if (!disabled && !isUploading) inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!disabled && !isUploading) inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled && !isUploading) onFiles(event.dataTransfer.files);
        }}
        className={cn(
          "relative flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          dragging && "border-primary bg-accent/50",
          !disabled && !isUploading && "cursor-pointer hover:bg-accent/40",
          (disabled || isUploading) && "opacity-70",
          error && "border-destructive",
        )}
      >
        {url && variant === "image" ? (
          <img
            src={url}
            alt="Uploaded file preview"
            className="max-h-40 w-auto rounded-md object-contain"
          />
        ) : url ? (
          <p className="max-w-full truncate text-sm">{url.split("/").pop()}</p>
        ) : (
          <>
            {variant === "image" ? (
              <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
            ) : (
              <UploadCloudIcon className="size-8 text-muted-foreground" aria-hidden />
            )}
            <p className="text-sm font-medium">Click to browse or drop a file here</p>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </>
        )}

        {isUploading ? (
          <div className="mt-2 flex w-full max-w-56 items-center gap-2">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            <Progress value={(progress ?? 0) * 100} className="h-1.5 flex-1" />
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="flex items-center justify-between gap-2">
        {/* The hint lives inside the drop target; repeating it here duplicated
            the same sentence twice on screen. Only errors belong below. */}
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setUrl(null);
              setLocalError(null);
            }}
            disabled={disabled || isUploading}
          >
            <Trash2Icon aria-hidden />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
