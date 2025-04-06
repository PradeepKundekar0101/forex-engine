import express from "express";
import { connectAccount, getAccountDetails } from "../controller/account";
import { unfreezeAccount } from "../utils/riskmanagement";
import { freezeAccount } from "../utils/riskmanagement";
import { CacheManager } from "../utils/cacheManager";
import Freeze from "../models/frozenAccount";
const router = express.Router();

router.post("/freeze", async (req, res) => {
  const { groupId, accountId, reason } = req.body;
  await freezeAccount(groupId, accountId, reason);
  res.status(200).json({ message: "Account frozen" });
});
router.post("/unfreeze", async (req, res) => {
  const { groupId, accountId } = req.body;
  await unfreezeAccount(groupId, accountId);
  res.status(200).json({ message: "Account unfrozen" });
});
router.get("/frozen", async (req, res) => {
  const frozenAccounts = CacheManager.getInstance().getFrozenAccounts();
  res.status(200).json(frozenAccounts);
});
router.get("/frozen/:groupId", async (req, res) => {
  const { groupId } = req.params;
  const frozenAccounts =
    CacheManager.getInstance().getFrozenAccounts()[groupId];
  res.status(200).json(frozenAccounts);
});
router.get("/frozen/:groupId/:accountId", async (req, res) => {
  try {
    const { groupId, accountId } = req.params;
    const frozenAccount = await Freeze.find({
      groupId,
      accountId,
    });
    res.status(200).json(frozenAccount);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
