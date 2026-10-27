// First-load JS per route, measured from the scripts the prerendered HTML references.
// Run after `pnpm build`: node scripts/bundle-size.mjs
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";

const routes = { "/": "index", "/stake": "stake", "/dashboard": "dashboard", "/redeem": "redeem", "/about": "about" };
for (const [route, file] of Object.entries(routes)) {
  const path = `.next/server/app/${file}.html`;
  if (!existsSync(path)) continue;
  const html = readFileSync(path, "utf8");
  const srcs = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.js[^"]*)"/g)].map((m) => m[1].split("?")[0]))];
  let raw = 0;
  let gz = 0;
  for (const s of srcs) {
    const buf = readFileSync(`.next/static/${decodeURIComponent(s).replace("/_next/static/", "")}`);
    raw += buf.length;
    gz += gzipSync(buf).length;
  }
  console.log(`${route.padEnd(11)} ${srcs.length} scripts  raw ${(raw / 1024).toFixed(0)} kB  gzip ${(gz / 1024).toFixed(0)} kB`);
}
