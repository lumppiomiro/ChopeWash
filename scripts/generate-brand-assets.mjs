// Mechanical format/size conversion of the supplied artwork; no artwork redesign.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const source = fileURLToPath(new URL("chopewash-logo.jpeg", root));
const output = new URL("public/branding/", root);
await mkdir(output, { recursive: true });
await sharp(source).resize(512, 512, { fit: "contain", background: "#ffffff" }).jpeg({ quality: 90 }).toFile(fileURLToPath(new URL("chopewash-logo.jpg", output)));
for (const [name, size] of [["icon-32.png", 32], ["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await sharp(source).resize(size, size, { fit: "contain", background: "#ffffff" }).png().toFile(fileURLToPath(new URL(name, output)));
}
// Extra safe-zone padding protects the full drawing under round/squircle masks.
await sharp(source).resize(384, 384).extend({ top: 64, bottom: 64, left: 64, right: 64, background: "#ffffff" }).png().toFile(fileURLToPath(new URL("icon-maskable-512.png", output)));
// ICO decoders (including Next's dev compiler) require RGBA PNG payloads.
const png = await sharp(source).resize(32, 32).ensureAlpha().png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 32; ico[7] = 32;
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
await writeFile(new URL("src/app/favicon.ico", root), Buffer.concat([ico, png]));
// Keep the old public favicon URL consistent for bookmarks and cached metadata.
await writeFile(new URL("public/favicon.svg", root), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><image width="32" height="32" href="data:image/png;base64,${png.toString("base64")}"/></svg>\n`);
console.log("Generated ChopeWash brand, browser and installation assets.");
