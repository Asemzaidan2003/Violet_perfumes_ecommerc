import User from "../models/user.model.js";
import { COOKIE, cookieOptions, createToken, hashPassword, verifyPassword } from "../middleware/auth.js";

export const login = async (req, res) => {
  const limiter = req.app.locals.limiters.login;
  if (!limiter.hit(req).ok) return res.status(429).json({ success: false, message: "Too many attempts, try again later" });

  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ success: false, message: "Username and password are required" });
  }

  const user = await User.findOne({ username });
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ success: false, message: "Invalid username or password" });
  }

  limiter.reset(req);
  res.cookie(COOKIE, createToken(user._id.toString()), cookieOptions());
  res.json({ success: true, data: { username: user.username, role: user.role } });
};

export const logout = (req, res) => {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE, opts);
  res.json({ success: true });
};

export const me = (req, res) => {
  res.json({ success: true, data: { username: req.user.username, role: req.user.role } });
};

export async function seedAdmin({ ADMIN_USERNAME, ADMIN_PASSWORD } = process.env) {
  if (await User.exists({})) return;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error("No users exist: set ADMIN_USERNAME and ADMIN_PASSWORD to create the first admin");
  }
  if (ADMIN_PASSWORD.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  }
  await User.create({ username: ADMIN_USERNAME, password_hash: await hashPassword(ADMIN_PASSWORD) });
  console.log(`Seeded admin user "${ADMIN_USERNAME}"`);
}
