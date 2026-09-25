import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";

let t, cookie;
before(async () => { t = await startTestApp(); cookie = await loginAs(t.url); });
after(() => t.close());

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x1a, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(14)]);
const up = (body, type, path = "/api/uploads?kind=product", withCookie = true) => fetch(`${t.url}${path}`, {
  method: "POST", headers: { ...(withCookie ? { cookie } : {}), "Content-Type": type }, body,
});

test("upload requires the admin session", async () => {
  assert.equal((await up(PNG, "image/png", undefined, false)).status, 401);
});

test("PNG, JPEG and WebP are accepted by magic bytes and served back immutable", async () => {
  for (const [buf, type, ext] of [[PNG, "image/png", "png"], [JPEG, "image/jpeg", "jpg"], [WEBP, "image/webp", "webp"]]) {
    const res = await up(buf, type);
    assert.equal(res.status, 201, type);
    const { data } = await res.json();
    assert.match(data.url, new RegExp(`^/img/[a-f0-9]{24}\\.${ext}$`));
    assert.equal(data.thumb, data.url.replace(`.${ext}`, `-480.${ext}`));
    const img = await fetch(`${t.url}${data.url}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), type);
    assert.match(img.headers.get("cache-control"), /immutable/);
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), buf);
    const thumbFallback = await fetch(`${t.url}${data.thumb}`);
    assert.equal(thumbFallback.status, 200, "thumb falls back to full");
  }
});

test("the type comes from the bytes, not the header", async () => {
  const res = await up(PNG, "image/jpeg");
  assert.equal(res.status, 201);
  assert.match((await res.json()).data.url, /\.png$/);
});

test("non-images are rejected", async () => {
  assert.equal((await up(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/png")).status, 400);
  assert.equal((await up(Buffer.from("<html>hi</html>"), "image/webp")).status, 400);
  assert.equal((await up(Buffer.from("x"), "text/plain")).status, 400, "unparsed type arrives as {} → 400");
});

test("files over 3 MB are rejected with 413", async () => {
  const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024 + 10)]);
  assert.equal((await up(big, "image/png")).status, 413);
});

test("thumb upload is stored and served", async () => {
  const { data } = await (await up(PNG, "image/png")).json();
  const res = await up(JPEG, "image/jpeg", `/api/uploads/${data.id}/thumb`);
  assert.equal(res.status, 200);
  const thumb = await fetch(`${t.url}${data.thumb}`);
  assert.equal(thumb.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await thumb.arrayBuffer()), JPEG);
});

test("served images carry nosniff and a locked-down CSP", async () => {
  const { data } = await (await up(PNG, "image/png")).json();
  const res = await fetch(`${t.url}${data.url}`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("content-security-policy"), "default-src 'none'; sandbox");
});

test("a stored image requested with the wrong extension is 404", async () => {
  const { data } = await (await up(PNG, "image/png")).json();
  const wrongExt = data.url.replace(/\.png$/, ".jpg");
  assert.equal((await fetch(`${t.url}${wrongExt}`)).status, 404);
});

test("unknown or malformed image paths are 404", async () => {
  assert.equal((await fetch(`${t.url}/img/64b7f0000000000000000000.png`)).status, 404);
  assert.equal((await fetch(`${t.url}/img/../../etc/passwd`)).status, 404);
  assert.equal((await fetch(`${t.url}/img/abc.png`)).status, 404);
});
