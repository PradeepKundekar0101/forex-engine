import express from "express";
import { connectAccount, getAccountDetails } from "../controller/account";
import { unfreezeAccount } from "../utils/riskmanagement";
import { freezeAccount } from "../utils/riskmanagement";
import { CacheManager } from "../utils/cacheManager";
import Freeze from "../models/frozenAccount";
const router = express.Router();

router.post("/freeze", async (req, res) => {
  // Risk management disabled - account freezing not allowed
  res
    .status(200)
    .json({ message: "Risk management disabled - no account freezing" });
});

router.post("/unfreeze", async (req, res) => {
  const { groupId, accountId } = req.body;
  await unfreezeAccount(groupId, accountId);
  res.status(200).json({ message: "Account unfrozen" });
});

router.get("/frozen", async (req, res) => {
  // Always return empty frozen accounts list since risk management is disabled
  res.status(200).json({});
});

router.get("/frozen/:groupId", async (req, res) => {
  // Always return empty frozen accounts list since risk management is disabled
  res.status(200).json({});
});

router.get("/frozen/:groupId/:accountId", async (req, res) => {
  try {
    // Always return empty frozen accounts list since risk management is disabled
    res.status(200).json([]);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
