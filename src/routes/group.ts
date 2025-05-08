import { Router, Request, Response } from "express";
import Group from "../models/group";
import GroupParticipant from "../models/groupParticipant";
import Mt5Connection from "../models/mt5Connections";
import { api, riskManagement } from "../constants/global";
import { TrackerEventListener } from "metaapi.cloud-sdk";
import { EventTracker } from "../services/TrackerListener";

// Helper function to format date in YYYY-MM-DD HH:mm:ss.SSS format
function formatDateForTracker(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

const router = Router();

router.post("/:id/participants", async (req, res) => {
  try {
    const { userId } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) {
      res.status(404).json({ message: "Group not found" });
      return;
    }
    const connection = await Mt5Connection.findOne({
      userId: userId,
    });
    if (!connection) {
      res.status(404).json({ message: "Please connect MT5 account first" });
      return;
    }
    const existingParticipant = await GroupParticipant.findOne({
      groupId: group._id,
      userId: userId,
      status: { $ne: "removed" },
    });
    if (existingParticipant) {
      res.status(400).json({ message: "Participant already exists" });
      return;
    }
    const account = await api.metatraderAccountApi.getAccount(
      connection.accountId
    );
    if (!account) {
      res.status(404).json({ message: "Please connect MT5 account first" });
      return;
    }
    const streamingConnection = account.getStreamingConnection();
    await streamingConnection.connect();

    // Add waiting time for terminal state to be populated
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Try to wait for terminal state to be fully populated
    let retries = 5;
    while (
      retries > 0 &&
      (!streamingConnection.terminalState ||
        !streamingConnection.terminalState.accountInformation)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      retries--;
    }

    if (
      !streamingConnection.terminalState ||
      !streamingConnection.terminalState.accountInformation
    ) {
      res.status(500).json({
        message:
          "Failed to retrieve account information. Please try again later.",
      });
      return;
    }

    const accountBalance =
      streamingConnection.terminalState.accountInformation.balance;
    if (accountBalance !== group.initialBalance && group.initialBalance !== 0) {
      res
        .status(400)
        .json({ message: "Invalid initial balance in MT5 account" });
      return;
    }

    // Format dates for tracker
    const startDate = new Date();
    const endDate = new Date(
      startDate.getTime() + 5 * 365 * 24 * 60 * 60 * 1000
    );

    let tracker = await riskManagement.riskManagementApi.createTracker(
      connection.accountId,
      {
        name: connection.accountId + ":" + group._id,
        period: "lifetime",
        relativeDrawdownThreshold: group.freezeThreshold / 100,
        startBrokerTime: formatDateForTracker(startDate),
        endBrokerTime: formatDateForTracker(endDate),
      }
    );
    const eventListener = new EventTracker(connection.accountId, tracker.id);
    let eventListenerId =
      riskManagement.riskManagementApi.addTrackerEventListener(
        eventListener,
        connection.accountId,
        tracker.id
      );
    const participant = new GroupParticipant({
      groupId: group._id,
      userId,
      accountId: connection.accountId,
      initialBalance: accountBalance,
      freezeThreshold: group.freezeThreshold,
      freezeDuration: group.freezeDuration,
      trackerId: tracker.id,
      listenerId: eventListenerId,
    });
    await participant.save();
    res.status(201).json(participant);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
});
export default router;
