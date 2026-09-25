import { once } from "node:events";
import mongoose from "mongoose";
import { createApp } from "../backend/app.js";

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
