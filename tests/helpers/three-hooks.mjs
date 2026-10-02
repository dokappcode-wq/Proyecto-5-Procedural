/** Hook de resolución para Node: `import 'three'` → la copia local (lib/three), como el importmap del navegador. */
const THREE_URL = new URL('../../lib/three/three.module.js', import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: THREE_URL, shortCircuit: true };
  return next(specifier, context);
}
