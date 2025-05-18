import { Request, Response } from "express";
import { CacheManager } from "../utils/cacheManager";
import Group from "../models/group";
import { Types } from "mongoose";
import User from "../models/user";
import GroupParticipant from "../models/groupParticipant";

const getParticipantData = (
  userName: string,
  accountId: string,
  email: string
) => {
  const data: Record<string, any> = {
    Omkar: {
      accountId: accountId,
      name: "240945250@Exness-MT5Real6",
      pnlPercentage: 30,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 1,
      totalTrades: 10,
      groupName: "Earning Edge mentorship",
      rank: 1,
      balance: 16764,
      equity: 16764,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917411420401,
      userId: "67f304ec0f2376b8bbbea352",
      freezeDetails: {},
    },
    Sameer: {
      accountId: accountId,
      name: "245827631@Exness-MT5Real3",
      pnlPercentage: 25,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 2,
      totalTrades: 15,
      groupName: "Earning Edge mentorship",
      rank: 2,
      balance: 15500,
      equity: 15500,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000001,
      userId: "67f304ec0f2376b8bbbea353",
      freezeDetails: {},
    },
    Rahul: {
      accountId: accountId,
      name: "242651982@Exness-MT5Real2",
      pnlPercentage: 22,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 1,
      totalTrades: 12,
      groupName: "Earning Edge mentorship",
      rank: 3,
      balance: 14800,
      equity: 14800,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000002,
      userId: "67f304ec0f2376b8bbbea354",
      freezeDetails: {},
    },
    Sohail: {
      accountId: accountId,
      name: "238743215@Exness-MT5Real5",
      pnlPercentage: 20,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 0,
      totalTrades: 18,
      groupName: "Earning Edge mentorship",
      rank: 4,
      balance: 14200,
      equity: 14200,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000003,
      userId: "67f304ec0f2376b8bbbea355",
      freezeDetails: {},
    },
    Darshan: {
      accountId: accountId,
      name: "240198765@Exness-MT5Real4",
      pnlPercentage: 18,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 1,
      totalTrades: 14,
      groupName: "Earning Edge mentorship",
      rank: 5,
      balance: 13800,
      equity: 13800,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000004,
      userId: "67f304ec0f2376b8bbbea356",
      freezeDetails: {},
    },
    avinash: {
      accountId: accountId,
      name: "235432109@Exness-MT5Real7",
      pnlPercentage: 16,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 2,
      totalTrades: 9,
      groupName: "Earning Edge mentorship",
      rank: 6,
      balance: 13500,
      equity: 13500,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000005,
      userId: "67f304ec0f2376b8bbbea357",
      freezeDetails: {},
    },
    Vaishnav: {
      accountId: accountId,
      name: "242876543@Exness-MT5Real1",
      pnlPercentage: 15,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 0,
      totalTrades: 11,
      groupName: "Earning Edge mentorship",
      rank: 7,
      balance: 13200,
      equity: 13200,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000006,
      userId: "67f304ec0f2376b8bbbea358",
      freezeDetails: {},
    },
    Sohan: {
      accountId: accountId,
      name: "237567890@Exness-MT5Real8",
      pnlPercentage: 14,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 1,
      totalTrades: 13,
      groupName: "Earning Edge mentorship",
      rank: 8,
      balance: 12900,
      equity: 12900,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000007,
      userId: "67f304ec0f2376b8bbbea359",
      freezeDetails: {},
    },
    Avinash: {
      accountId: accountId,
      name: "240654321@Exness-MT5Real2",
      pnlPercentage: 12,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 2,
      totalTrades: 16,
      groupName: "Earning Edge mentorship",
      rank: 9,
      balance: 12600,
      equity: 12600,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000008,
      userId: "67f304ec0f2376b8bbbea360",
      freezeDetails: {},
    },
    Sidharth: {
      accountId: accountId,
      name: "238345678@Exness-MT5Real5",
      pnlPercentage: 10,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 0,
      totalTrades: 8,
      groupName: "Earning Edge mentorship",
      rank: 10,
      balance: 12300,
      equity: 12300,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000009,
      userId: "67f304ec0f2376b8bbbea361",
      freezeDetails: {},
    },
    Dhruv: {
      accountId: accountId,
      name: "242987654@Exness-MT5Real9",
      pnlPercentage: 8,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 1,
      totalTrades: 7,
      groupName: "Earning Edge mentorship",
      rank: 11,
      balance: 12000,
      equity: 12000,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000010,
      userId: "67f304ec0f2376b8bbbea362",
      freezeDetails: {},
    },
    Faizan: {
      accountId: accountId,
      name: "235789012@Exness-MT5Real3",
      pnlPercentage: 7,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 2,
      totalTrades: 17,
      groupName: "Earning Edge mentorship",
      rank: 12,
      balance: 11700,
      equity: 11700,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000011,
      userId: "67f304ec0f2376b8bbbea363",
      freezeDetails: {},
    },
    Brian: {
      accountId: accountId,
      name: "237123456@Exness-MT5Real4",
      pnlPercentage: 5,
      groupId: "682a3cb44d4c7d8a75a15a30",
      totalFreezesCount: 0,
      totalTrades: 6,
      groupName: "Earning Edge mentorship",
      rank: 13,
      balance: 11400,
      equity: 11400,
      profitLoss: 0,
      userName: userName,
      email: email,
      phoneNumber: 917400000012,
      userId: "67f304ec0f2376b8bbbea364",
      freezeDetails: {},
    },
  };

  return data[userName] || null;
};

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    if (!Types.ObjectId.isValid(groupId)) {
      res.status(400).json({ error: "Invalid group ID format" });
      return;
    }
    if (groupId === "682a3cb44d4c7d8a75a15a30") {
      const users = await User.find({ email_otp: "123456" });
      let leaderBoard: any[] = [];
      for (const user of users) {
        const groupParticipant = await GroupParticipant.findOne({
          userId: user._id,
        });
        const participantData = getParticipantData(
          user.firstName || "",
          groupParticipant?.accountId || "",
          user.email || ""
        );
        if (participantData) {
          leaderBoard.push(participantData);
        }
      }
      //sort by rank
      leaderBoard.sort((a, b) => a.rank - b.rank);
      res.status(200).json({ leaderboard: leaderBoard, timestamp: Date.now() });
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
      return;
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
