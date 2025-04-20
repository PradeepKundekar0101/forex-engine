import express from "express";
import { unfreezeAccount } from "../utils/riskmanagement";
import { freezeAccount } from "../utils/riskmanagement";
import Freeze from "../models/frozenAccount";
const router = express.Router();

router.post("/freeze", async (req, res) => {
  try {
    const { groupId, accountId, reason } = req.body;
    await freezeAccount(groupId, accountId, reason, false);
    res.status(200).json({ message: "Account frozen" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/unfreeze", async (req, res) => {
  const { groupId, accountId } = req.body;
  await unfreezeAccount(groupId, accountId);
  res.status(200).json({ message: "Account unfrozen" });
});

router.get("/frozen", async (req, res) => {
  // Always return empty frozen accounts list since risk management is disable
  res.status(200).json({});
});

router.get("/frozen/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const frozenAccounts = await Freeze.find({ groupId, active: true });
    res.status(200).json(frozenAccounts);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/frozen/:groupId/:accountId", async (req, res) => {
  try {
    const { groupId, accountId } = req.params;
    const frozenAccount = await Freeze.findOne({
      groupId,
      accountId,
      active: true,
    });
    res.status(200).json(frozenAccount);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
