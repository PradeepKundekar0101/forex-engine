import { Router } from "express";
import { getLeaderboard } from "../controller/leaderBoard";

const router = Router();

router.get("/:groupId", getLeaderboard);

export default router;
