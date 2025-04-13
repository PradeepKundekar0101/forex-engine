import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import { CacheManager } from "./utils/cacheManager";
import accountRoutes from "./routes/account";
import leaderboardRoutes from "./routes/leaderboard";
import riskmanagementRoutes from "./routes/riskmanagement";

dotenv.config();

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
const port = 8000;

app.listen(port, "0.0.0.0", () => {
  const mongoConnect = async (uri: string) => {
    try {
      const { connection } = await mongoose.connect(uri, {
        dbName: "EarningEdge:Production",
      });
      console.log(`MongoDB connected to ${connection.host}`);
      console.log("===========================");


      await restoreFreezeTimeouts();


    } catch (error) {
      console.log("MongoDB connection failed", error);
      return Promise.reject(error);
    }
  };
  mongoConnect(process.env.MONGODB_URI || "");
  CacheManager.getInstance().init(30000, 2200);
  console.log(`Server is running on port ${port}`);
});

app.use("/api/account", accountRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/riskmanagement", riskmanagementRoutes);
