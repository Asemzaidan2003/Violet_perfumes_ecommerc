import crypto from "node:crypto";
import { promisify } from "node:util";
import User from "../models/user.model.js";

const scrypt = promisify(crypto.scrypt);
export const COOKIE = "nsamat_session";
const TTL_MS = 12 * 60 * 60 * 1000;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored).split(":");
  if (!salt || !hex) return false;
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  return expected.length === key.length && crypto.timingSafeEqual(key, expected);
}

const sign = (data) =>
  crypto.createHmac("sha256", process.env.SESSION_SECRET).update(data).digest("base64url");

// Token = "<userId>.<expiryMs>.<hmac>" — stateless, no JWT library needed.
export function createToken(userId, now = Date.now()) {
  const data = `${userId}.${now + TTL_MS}`;
  return `${data}.${sign(data)}`;
}

export function verifyToken(token, now = Date.now()) {
  const [id, exp, mac] = String(token ?? "").split(".");
  if (!id || !exp || !mac) return null;
  const good = Buffer.from(sign(`${id}.${exp}`));
  const got = Buffer.from(mac);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  return Number(exp) > now ? id : null;
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  maxAge: TTL_MS,
  path: "/",
});

function readCookie(req, name) {
  const pair = (req.headers.cookie || "").split(";").map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

export async function requireAdmin(req, res, next) {
  const id = verifyToken(readCookie(req, COOKIE));
  // DB lookup per request so deleting a user revokes their session immediately.
  const user = id && (await User.findById(id).select("username role").lean());
  if (!user || user.role !== "admin") {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  req.user = user;
  next();
}
