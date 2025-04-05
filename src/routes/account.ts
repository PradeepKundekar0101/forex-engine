import express from "express";
import { connectAccount, getAccountDetails } from "../controller/account";
const router = express.Router();

router.post("/connect", connectAccount);
router.get("/user/:userId", getAccountDetails);
export default router;
