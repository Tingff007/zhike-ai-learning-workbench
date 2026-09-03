import { GlobalWorkerOptions } from 'pdfjs-dist';

/** pdfjs Worker（Vite ESM）入口。 */
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export { getDocument } from 'pdfjs-dist';
