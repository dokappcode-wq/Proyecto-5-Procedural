/**
 * Regenera systems/PROMPT_PARA_CLAUDE.txt (plantilla + formato de sistema solar)
 * a partir del esquema y el catálogo:   npm run prompt
 */
import fs from 'node:fs';
import { formatGuide } from '../js/systemdata/FormatGuide.js';

const out = new URL('../systems/PROMPT_PARA_CLAUDE.txt', import.meta.url);
fs.writeFileSync(out, `${formatGuide()}\n`);
console.log(`Escrito ${out.pathname}`);
