import { once } from "node:events";
import mongoose from "mongoose";
import { createApp } from "../backend/app.js";
import User from "../backend/models/user.model.js";
import { hashPassword } from "../backend/middleware/auth.js";

process.env.SESSION_SECRET ||= "test-session-secret-".padEnd(48, "x");

export async function startTestApp() {
  const uri = `mongodb://127.0.0.1:27017/nsamat_test_${process.pid}?replicaSet=rs0`;
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      await new Promise((r) => server.close(r));
    },
  };
}

export async function loginAs(url, username = "admin", password = "test-pass") {
  if (!(await User.exists({ username }))) {
    await User.create({ username, password_hash: await hashPassword(password), role: "admin" });
  }
  const res = await fetch(`${url}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return res.headers.get("set-cookie").split(";")[0];
}
