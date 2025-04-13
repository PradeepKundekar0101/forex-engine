import express from "express";
import {
  connectAccount,
  getAccountDetails,
  disconnectAccount,
} from "../controller/account";
const router = express.Router();

router.post("/connect", connectAccount);
router.post("/disconnect", disconnectAccount);
router.get("/user/:userId", getAccountDetails);
export default router;
