import { Request, Response } from "express";
import { CacheManager } from "../utils/cacheManager";
import Group from "../models/group";
import { Types } from "mongoose";

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    if (!Types.ObjectId.isValid(groupId)) {
      res.status(400).json({ error: "Invalid group ID format" });
      return;
    }
    const leaderboard = CacheManager.getInstance().getLeaderboard(groupId);
    if (!leaderboard || leaderboard.length === 0) {
      const groupExists = await Group.findById(groupId);
      if (!groupExists) {
        res.status(404).json({ error: "Group not found" });
        return;
      }
      res.status(200).json([]);
    }
    const responseData = {
      timestamp: CacheManager.getInstance().getLastRefreshTime(),
      leaderboard: leaderboard,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};
