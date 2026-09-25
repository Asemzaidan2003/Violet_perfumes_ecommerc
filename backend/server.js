import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { seedAdmin } from "./controller/auth.Controller.js";

for (const key of ["MONGO_URI", "SESSION_SECRET"]) {
  if (!process.env[key]) { console.error(`Missing required env var ${key}`); process.exit(1); }
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET must be at least 32 characters"); process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
console.log(`MongoDB connected: ${mongoose.connection.host}`);
await seedAdmin();

const port = process.env.PORT || 3000;
const server = createApp().listen(port, () => console.log(`Server started on port ${port}`));

const shutdown = () => server.close(() => mongoose.disconnect().then(() => process.exit(0)));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
