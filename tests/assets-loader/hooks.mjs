// Test-only Node loader hook: Vite turns `import logo from './x.webp'` into a URL string; plain Node cannot load image files.
// This makes the same import resolve to '/assets/<file name>' so component tests can render server-side.
export async function load(url, context, nextLoad) {
  if (/\.(webp|png|jpe?g|svg|gif|avif)(\?.*)?$/i.test(url)) {
    return {format: 'module', shortCircuit: true, source: `export default ${JSON.stringify('/assets/' + url.split('/').pop().split('?')[0])};`};
  }
  return nextLoad(url, context);
}
