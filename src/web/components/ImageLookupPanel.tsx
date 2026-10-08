import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, ScanText, X, ZoomIn, ZoomOut } from "lucide-react";
import type { JapaneseImageOcrResult } from "../lib/imageOcr.ts";
import { Button } from "./ui/button.tsx";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function ImageLookupPanel({ onSearch }: { onSearch: (text: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rawTextRef = useRef<HTMLTextAreaElement>(null);
  const selectedTextRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ocrUsedRef = useRef(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<JapaneseImageOcrResult | null>(null);
  const [rawText, setRawText] = useState("");
  const [selectedRegionIds, setSelectedRegionIds] = useState<number[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const activeRegion = result && selectedRegionIds.length
    ? result.regions[selectedRegionIds[selectedRegionIds.length - 1]]
    : null;
  const wordChoices = activeRegion
    ? [...new Set([
      ...(activeRegion.words ?? []),
      ...[...activeRegion.text].filter((character) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(character)),
    ])].slice(0, 16)
    : [];

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => setError("Không phát được hình ảnh camera. Hãy thử mở lại."));
    }
  }, [cameraOpen]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (ocrUsedRef.current) {
      void import("../lib/imageOcr.ts").then(({ disposeJapaneseOcr }) => disposeJapaneseOcr());
    }
  }, []);

  function prepareOcr() {
    ocrUsedRef.current = true;
    // Start loading the model while the user takes or chooses a photo.
    void import("../lib/imageOcr.ts").then(({ prepareJapaneseOcr }) => prepareJapaneseOcr()).catch(() => {
      // The actual scan will show a useful error if loading fails.
    });
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function openCamera() {
    setError("");
    prepareOcr();
    // Camera streams require HTTPS. On a LAN HTTP preview, mobile browsers
    // can still open the native camera through a capture-enabled file input.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      setCameraOpen(true);
    } catch {
      setError("Không mở được camera. Hãy cấp quyền camera hoặc chọn ảnh từ thiết bị.");
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("Camera chưa sẵn sàng. Hãy thử chụp lại.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth, 2400);
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Không xử lý được ảnh camera. Hãy thử chọn ảnh từ thiết bị.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    closeCamera();
    if (image) void scan(new File([image], "camera.jpg", { type: "image/jpeg" }));
    else setError("Không chụp được ảnh. Hãy thử lại.");
  }

  async function scan(file?: File) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Hãy chọn một tệp ảnh.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Ảnh quá lớn. Hãy chọn ảnh dưới 20 MB.");
      return;
    }

    ocrUsedRef.current = true;
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setRawText("");
    setSelectedRegionIds([]);
    setSelectedText("");
    setZoom(1);
    setProgress(0);
    setBusy(true);
    setViewerOpen(true);
    try {
      const { recognizeJapaneseImage } = await import("../lib/imageOcr.ts");
      const recognized = await recognizeJapaneseImage(file, setProgress);
      setResult(recognized);
      setRawText(recognized.text);
      if (!recognized.regions.length) {
        setError(recognized.text.trim()
          ? "Chưa định vị được vùng chữ Nhật đáng tin cậy. Bạn có thể xem toàn bộ chữ OCR bên dưới."
          : "Chưa nhận ra chữ trong ảnh. Hãy thử ảnh rõ hơn hoặc chụp sát vùng chữ.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không quét được ảnh. Hãy thử lại.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function toggleRegion(index: number) {
    if (!result) return;
    const next = selectedRegionIds.includes(index)
      ? selectedRegionIds.filter((id) => id !== index)
      : [...selectedRegionIds, index];
    setSelectedRegionIds(next);
    setSelectedText(next.map((id) => result.regions[id].text).join(""));
  }

  function useRawSelection() {
    const field = rawTextRef.current;
    const selection = field?.value.slice(field.selectionStart, field.selectionEnd).trim();
    const firstLine = rawText.split(/\r?\n/).find((line) => line.trim())?.trim();
    setSelectedRegionIds([]);
    setSelectedText(selection || firstLine || "");
  }

  function searchSelection() {
    const field = selectedTextRef.current;
    const highlighted = field?.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0).trim();
    const term = highlighted || selectedText.trim();
    if (!term) return;
    setViewerOpen(false);
    onSearch(term);
  }

  return (
    <section className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-3 sm:p-4" aria-label="Quét chữ từ ảnh">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <ScanText size={17} /> Chọn chữ từ ảnh <span className="text-xs font-normal text-neutral-400">demo</span>
        </span>
        <Button type="button" variant="outline" size="sm" disabled={busy || cameraOpen} onClick={() => {
          prepareOcr();
          fileInputRef.current?.click();
        }}>
          <ImagePlus size={15} /> Chọn ảnh
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy || cameraOpen} onClick={() => void openCamera()}>
          <Camera size={15} /> Chụp ảnh
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Chọn ảnh để quét chữ"
        onChange={(event) => {
          void scan(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Chụp ảnh để quét chữ"
        onChange={(event) => {
          void scan(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <p className="mt-2 text-xs text-neutral-500">Chụp hoặc chọn ảnh, sau đó chạm vùng chữ trên ảnh để tra. Ảnh được xử lý trên thiết bị.</p>

      {cameraOpen ? (
        <div className="mt-3 rounded-xl border border-neutral-200 bg-black p-2">
          <video ref={videoRef} autoPlay playsInline muted className="max-h-80 w-full rounded-lg object-contain" aria-label="Hình ảnh camera" />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={closeCamera}>Đóng</Button>
            <Button type="button" size="sm" onClick={() => void capturePhoto()}><Camera size={15} /> Chụp và quét</Button>
          </div>
        </div>
      ) : null}

      {previewUrl ? (
        <button type="button" onClick={() => setViewerOpen(true)} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2 text-left hover:border-rose-200">
          <img src={previewUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          <span className="text-sm font-medium text-neutral-700">
            {busy ? `Đang quét chữ… ${progress === null ? "" : `${Math.round(progress * 100)}%`}` : "Mở ảnh để chọn chữ"}
          </span>
        </button>
      ) : null}
      {!previewUrl && error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null}

      {viewerOpen && previewUrl ? (
        <div role="dialog" aria-modal="true" aria-label="Chọn chữ trên ảnh" className="fixed inset-0 z-[100] flex flex-col bg-neutral-950 text-white">
          <header className="flex shrink-0 items-center gap-2 border-b border-white/20 px-3 py-2">
            <button type="button" onClick={() => setViewerOpen(false)} aria-label="Đóng ảnh" className="rounded-lg p-2 hover:bg-white/10"><X size={20} /></button>
            <strong className="min-w-0 flex-1 text-sm">Chạm dòng chữ trên ảnh để chọn</strong>
            <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.5))} disabled={zoom <= 1} aria-label="Thu nhỏ" className="rounded-lg p-2 disabled:opacity-40"><ZoomOut size={20} /></button>
            <span className="text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.5))} disabled={zoom >= 3} aria-label="Phóng to" className="rounded-lg p-2 disabled:opacity-40"><ZoomIn size={20} /></button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="relative mx-auto" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "1000px" : undefined }}>
              <img src={previewUrl} alt="Ảnh để chọn chữ" className="block h-auto w-full brightness-75" draggable={false} />
              {result?.regions.map((region, index) => {
                const selected = selectedRegionIds.includes(index);
                return (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Chọn chữ ${region.text}`}
                    aria-pressed={selected}
                    onClick={() => toggleRegion(index)}
                    className={`absolute rounded-[3px] border shadow-sm ${selected ? "border-sky-500 bg-sky-300/65" : "border-white/70 bg-white/45 hover:bg-white/70"}`}
                    style={{
                      left: `${region.x0 * 100}%`,
                      top: `${region.y0 * 100}%`,
                      width: `${Math.max(0.5, (region.x1 - region.x0) * 100)}%`,
                      height: `${Math.max(0.5, (region.y1 - region.y0) * 100)}%`,
                    }}
                  />
                );
              })}
            </div>
          </div>
          <div className="shrink-0 border-t border-neutral-200 bg-white p-3 text-neutral-800">
            {busy ? <p role="status" className="text-sm">Đang xác định vùng chữ… {progress === null ? "" : `${Math.round(progress * 100)}%`}</p> : null}
            {error ? <p role="alert" className="mb-2 text-sm text-rose-700">{error}</p> : null}
            {!busy && result ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="selected-image-text" className="text-xs font-semibold">Chữ đã chọn — có thể sửa hoặc bôi đen một phần trước khi tra</label>
                  <button type="button" onClick={() => { setSelectedRegionIds([]); setSelectedText(""); }} className="text-xs text-neutral-500">Xóa chọn</button>
                </div>
                <div className="mt-1 flex gap-2">
                  <input
                    id="selected-image-text"
                    ref={selectedTextRef}
                    type="text"
                    value={selectedText}
                    onChange={(event) => setSelectedText(event.target.value)}
                    placeholder="Chạm vào chữ trên ảnh"
                    className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                  <Button type="button" onClick={searchSelection} disabled={!selectedText.trim()}>Tra cứu</Button>
                </div>
                {wordChoices.length ? (
                  <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1" aria-label="Chọn từ hoặc Kanji trong dòng">
                    <span className="shrink-0 text-xs text-neutral-500">Trong dòng:</span>
                    {wordChoices.map((word) => (
                      <button
                        key={word}
                        type="button"
                        onClick={() => setSelectedText(word)}
                        className="shrink-0 rounded-full border border-neutral-200 px-2.5 py-1 text-sm hover:border-sky-300 hover:bg-sky-50"
                      >
                        {word}
                      </button>
                    ))}
                  </div>
                ) : null}
                <details className="mt-2 text-xs text-neutral-500">
                  <summary className="cursor-pointer">Không chọn được trên ảnh? Xem toàn bộ chữ OCR</summary>
                  <textarea
                    ref={rawTextRef}
                    value={rawText}
                    onChange={(event) => setRawText(event.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-neutral-300 p-2 text-sm text-neutral-800"
                  />
                  <button type="button" onClick={useRawSelection} className="mt-1 font-medium text-rose-700">Dùng chữ đã bôi đen hoặc dòng đầu</button>
                </details>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
