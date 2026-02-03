type Html2PdfFactory = () => any;

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export const prepareImagesForCanvas = (root: HTMLElement) => {
  const imgs = Array.from(root.querySelectorAll('img'));

  for (const img of imgs) {
    const src = img.getAttribute('src')?.trim();
    if (!src) continue;

    const newImg = document.createElement('img');

    // Copy non-event attributes except src
    for (const attr of Array.from(img.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === 'src') continue;
      if (name.startsWith('on')) continue;
      newImg.setAttribute(attr.name, attr.value);
    }

    // Must be set BEFORE src to avoid tainting / CORS issues.
    newImg.crossOrigin = 'anonymous';
    newImg.referrerPolicy = 'no-referrer';

    // Hide broken image (avoid html2canvas oddities on broken resources)
    newImg.onerror = () => {
      newImg.style.display = 'none';
      const next = newImg.nextElementSibling as HTMLElement | null;
      if (next) next.style.display = 'block';
    };

    newImg.src = src;
    img.replaceWith(newImg);
  }
};

const waitForImages = async (root: ParentNode, timeoutMs: number) => {
  const imgs = Array.from(root.querySelectorAll('img'));

  const tasks = imgs.map(
    (img) =>
      new Promise<void>((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const decodeFn = (img as any).decode as (() => Promise<void>) | undefined;
        if (decodeFn) {
          const t = setTimeout(() => resolve(), timeoutMs);
          decodeFn
            .call(img)
            .catch(() => {
              // ignore
            })
            .finally(() => {
              clearTimeout(t);
              resolve();
            });
          return;
        }

        if (img.complete) return resolve();

        const t = setTimeout(() => resolve(), timeoutMs);
        img.onload = () => {
          clearTimeout(t);
          resolve();
        };
        img.onerror = () => {
          clearTimeout(t);
          resolve();
        };
      })
  );

  await Promise.all(tasks);
};

const waitForFonts = async (doc: Document) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fonts: any = (doc as any).fonts;
  if (!fonts?.ready) return;
  try {
    await fonts.ready;
  } catch {
    // ignore
  }
};

/**
 * html2pdf clones source into its own hidden overlay container.
 * If we only wait assets on the original element, we can still get a blank PDF.
 * This helper waits for images/fonts INSIDE html2pdf's internal container BEFORE toCanvas().
 */
export const saveWithHtml2PdfWorker = async (
  html2pdf: Html2PdfFactory,
  sourceEl: HTMLElement,
  opt: Record<string, unknown>,
  assetTimeoutMs = 5000
) => {
  const worker = html2pdf().set(opt).from(sourceEl);

  // Step 1: build internal hidden container
  await worker.toContainer();

  // Step 2: wait assets in internal container (the one html2canvas will actually capture)
  const internalContainer = (await worker.get('container')) as HTMLElement | undefined;
  if (internalContainer) {
    await waitForImages(internalContainer, assetTimeoutMs);
    await waitForFonts(internalContainer.ownerDocument);
    await raf();
    await raf();
  }

  // Step 3: capture + build pdf + save
  await worker.toCanvas();
  await worker.toPdf();
  await worker.save();
};

export const cleanupHtml2PdfOverlays = () => {
  // If something throws mid-chain, html2pdf overlay might remain.
  document
    .querySelectorAll('.html2pdf__overlay')
    .forEach((el) => el.parentElement?.removeChild(el));
};
