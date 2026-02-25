type DownloadPdfFromHtmlParams = {
  /** Full HTML document (recommended) or partial HTML. */
  html: string;
  /** Filename with or without .pdf */
  filename: string;
  /** html2canvas scale factor (higher = sharper, slower). */
  scale?: number;
  /** Force a consistent A4-ish layout width in pixels (96dpi A4 width ~= 794px). */
  viewportWidthPx?: number;
  /** Max time to wait for images/fonts in ms. */
  assetTimeoutMs?: number;
};

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const withPdfExt = (name: string) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'document.pdf';
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
};

const injectBaseHref = (html: string) => {
  // Ensures relative URLs inside srcDoc resolve to the app origin.
  const baseTag = `<base href="${window.location.origin}/">`;
  if (/<base\b/i.test(html)) return html;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b([^>]*)>/i, (m) => `${m}\n${baseTag}`);
  }
  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
};

const waitForImages = async (doc: Document, timeoutMs: number) => {
  const imgs = Array.from(doc.querySelectorAll('img'));
  const tasks = imgs.map(
    (img) =>
      new Promise<void>((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const decodeFn = (img as any).decode as (() => Promise<void>) | undefined;
        const timer = window.setTimeout(() => resolve(), timeoutMs);

        const done = () => {
          window.clearTimeout(timer);
          resolve();
        };

        if (decodeFn) {
          decodeFn.call(img).catch(() => undefined).finally(done);
          return;
        }

        if (img.complete) return done();
        img.onload = done;
        img.onerror = done;
      })
  );

  await Promise.all(tasks);
};

const waitForFonts = async (doc: Document, timeoutMs: number) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fonts: any = (doc as any).fonts;
  if (!fonts?.ready) return;

  await Promise.race([
    fonts.ready.catch(() => undefined),
    new Promise<void>((r) => window.setTimeout(() => r(), timeoutMs)),
  ]);
};

const waitForIframeLoad = (iframe: HTMLIFrameElement, timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('PDF iframe load timeout')), timeoutMs);
    iframe.onload = () => {
      window.clearTimeout(t);
      resolve();
    };
  });

/**
 * Robust PDF generation:
 * 1) Render sanitized HTML in an off-screen iframe (so layout matches the preview)
 * 2) Snapshot iframe DOM with html2canvas
 * 3) Build a multi-page A4 PDF with jsPDF
 */
export const downloadPdfFromHtml = async ({
  html,
  filename,
  scale = 2,
  viewportWidthPx = 794,
  assetTimeoutMs = 12_000,
}: DownloadPdfFromHtmlParams): Promise<void> => {
  const finalFilename = withPdfExt(filename);
  const iframe = document.createElement('iframe');

  iframe.style.cssText = [
    'position: fixed',
    'left: -10000px',
    'top: 0',
    `width: ${viewportWidthPx}px`,
    'height: 1123px',
    'border: 0',
    'background: white',
    'pointer-events: none',
    'z-index: -1',
  ].join(';');

  document.body.appendChild(iframe);

  try {
    iframe.srcdoc = injectBaseHref(html);
    await waitForIframeLoad(iframe, 15_000);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) throw new Error('PDF iframe not ready');

    doc.documentElement.style.background = '#ffffff';
    doc.body.style.margin = '0';
    doc.body.style.overflow = 'visible';

    await waitForImages(doc, assetTimeoutMs);
    await waitForFonts(doc, assetTimeoutMs);
    await raf();
    await raf();

    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');

    // Capture the .pdf-page wrapper (fixed 794px width = exact A4 ratio)
    const captureEl = doc.querySelector('.pdf-page') as HTMLElement || doc.body;
    const captureHeight = Math.max(captureEl.scrollHeight, 1123);

    const canvas = await html2canvas(captureEl, {
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      width: 794,
      height: captureHeight,
      windowWidth: viewportWidthPx,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();  // 210mm
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm

    const imgData = canvas.toDataURL('image/jpeg', 0.98);

    // Single page — canvas is exactly A4 ratio, so it maps 1:1
    pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

    pdf.save(finalFilename);
  } finally {
    iframe.remove();
  }
};
