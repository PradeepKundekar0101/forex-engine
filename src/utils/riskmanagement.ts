import { api } from "../constants/global";
import { CacheManager } from "./cacheManager";
import Freeze from "../models/frozenAccount";
import Group from "../models/group";
import { logger } from "./logger";
import GroupParticipant from "../models/groupParticipant";
import { riskManagement } from "../constants/global";
import { EventTracker } from "../services/TrackerListener";

export const handleCloseAllPositions = async (
  groupId: string,
  accountId: string
) => {
  try {
    const connection = (
      await api.metatraderAccountApi.getAccount(accountId)
    ).getStreamingConnection();

    // Always connect to ensure connection is initialized properly
    await connection.connect();

    console.log("Closing all positions");
    const positions = connection.terminalState.positions;
    for (const position of positions) {
      await connection.closePosition(position.id.toString(), {
        comment: "RM Emergency Close",
      });
    }
    return connection;
  } catch (error) {
    console.log("Error closing all positions", error);
  }
};
export const handleCloseAllOrders = async (
  groupId: string,
  accountId: string
) => {
  try {
    const connection = (
      await api.metatraderAccountApi.getAccount(accountId)
    ).getStreamingConnection();

    // Always connect to ensure connection is initialized properly
    await connection.connect();

    console.log("Closing all orders");
    const orders = connection.terminalState.orders;
    for (const order of orders) {
      await connection.cancelOrder(order.id.toString());
    }
    return connection;
  } catch (error) {
    console.log("Error closing all orders", error);
  }
};

export async function freezeAccount(
  groupId: string,
  accountId: string,
  reason: string,
  automated: boolean = false,
  freezeDuration: number | undefined
) {
  try {
    if (CacheManager.getInstance().getFrozenAccounts()[groupId]?.[accountId]) {
      return;
    }
    const frozenAccount = await Freeze.findOne({
      groupId,
      accountId,
      active: true,
    });
    if (frozenAccount) {
      return;
    }
    const group = await Group.findById(groupId);
    if (!group) {
      throw new Error("Group not found");
    }
    logger.info(
      `Freezing account ${accountId} in group ${groupId} due to drawdown`
    );
    const participant = CacheManager.getInstance().getParticipant(accountId);
    const connection = await handleCloseAllPositions(groupId, accountId);
    await handleCloseAllOrders(groupId, accountId);
    if (!connection) {
      throw new Error("Connection not found");
    }
    const equity = connection.terminalState.accountInformation.equity;
    console.log("initialEquity", equity);
    if (participant) {
      participant.initialBalance = equity;
      const response = await GroupParticipant.updateOne(
        { accountId, groupId },
        { $set: { initialBalance: equity } }
      );
      console.log(response);
    }
    const releaseTimeout = setTimeout(() => {
      unfreezeAccount(groupId, accountId);
    }, freezeDuration || group.freezeDuration);

    const releaseTime = new Date(
      Date.now() + (freezeDuration || group.freezeDuration)
    );
    CacheManager.getInstance().getFrozenAccounts()[groupId][accountId] = {
      accountId,
      frozenAt: new Date(),
      releaseTime,
      reason,
      automated,
      _releaseTimeout: releaseTimeout,
    };

    await Freeze.create({
      groupId,
      accountId,
      frozenAt: new Date(),
      releaseTime,
      reason,
      automated,
      initialEquity: equity,
    });
  } catch (error) {
    console.error("Error freezing account", error);
  }
}

// Function to unfreeze an account after the timeout
export async function unfreezeAccount(groupId: string, accountId: string) {
  const frozenAccount =
    CacheManager.getInstance().getFrozenAccounts()[groupId][accountId];
  if (!frozenAccount) {
    return;
  }

  console.log(`[Risk Management] Unfreezing account ${accountId}`);

  // Remove from frozen accounts
  if (frozenAccount._releaseTimeout) {
    clearTimeout(frozenAccount._releaseTimeout);
  }
  delete CacheManager.getInstance().getFrozenAccounts()[groupId][accountId];

  // Update MongoDB record
  try {
    await Freeze.updateMany(
      { accountId, active: true },
      { $set: { active: false, releasedAt: new Date() } }
    );
    console.log(
      `[Risk Management] Updated freeze records in MongoDB for account ${accountId}`
    );

    // Create a new tracker with updated equity as initial balance
    await createNewTracker(groupId, accountId);
  } catch (error) {
    console.error(
      `[Risk Management] Error updating freeze records in MongoDB:`,
      error
    );
  }
}

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

// Function to create a new tracker after unfreezing
export async function createNewTracker(groupId: string, accountId: string) {
  try {
    // Get the participant data
    const groupParticipant = await GroupParticipant.findOne({
      groupId: groupId,
      accountId: accountId,
    });

    if (!groupParticipant) {
      console.error(`[Risk Management] Participant not found for ${accountId}`);
      return;
    }

    // Get the current equity from the account
    const account = await api.metatraderAccountApi.getAccount(accountId);
    if (!account) {
      console.error(`[Risk Management] Account not found: ${accountId}`);
      return;
    }

    const connection = account.getStreamingConnection();
    await connection.connect();

    // Wait for terminal state to be populated
    let retries = 5;
    while (
      retries > 0 &&
      (!connection.terminalState ||
        !connection.terminalState.accountInformation)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      retries--;
    }

    if (
      !connection.terminalState ||
      !connection.terminalState.accountInformation
    ) {
      console.error(
        `[Risk Management] Failed to get account information for ${accountId}`
      );
      return;
    }

    const currentEquity = connection.terminalState.accountInformation.equity;

    console.log(
      `[Risk Management] Creating new tracker for ${accountId} with initial equity ${currentEquity}`
    );

    // Format dates for tracker
    const startDate = new Date();
    const endDate = new Date(
      startDate.getTime() + 5 * 365 * 24 * 60 * 60 * 1000
    );

    // Create a new tracker
    const tracker = await riskManagement.riskManagementApi.createTracker(
      accountId,
      {
        name: accountId + ":" + groupId,
        period: "lifetime",
        relativeDrawdownThreshold:
          (groupParticipant.freezeThreshold || 0) / 100,
        startBrokerTime: formatDateForTracker(startDate),
        endBrokerTime: formatDateForTracker(endDate),
      }
    );

    // Add event listener
    const eventListener = new EventTracker(accountId, tracker.id);
    const eventListenerId =
      riskManagement.riskManagementApi.addTrackerEventListener(
        eventListener,
        accountId,
        tracker.id
      );

    // Update the participant record with new tracker ID and initial balance
    await GroupParticipant.updateOne(
      { accountId, groupId },
      {
        $set: {
          trackerId: tracker.id,
          listenerId: eventListenerId,
          initialBalance: currentEquity,
        },
      }
    );

    console.log(
      `[Risk Management] New tracker created for ${accountId} with ID ${tracker.id}`
    );

    // Also update the cache manager
    const participant = CacheManager.getInstance().getParticipant(accountId);
    if (participant) {
      participant.initialBalance = currentEquity;
      participant.trackerId = tracker.id;
    }
  } catch (error) {
    console.error(`[Risk Management] Error creating new tracker:`, error);
  }
}

export async function restoreFreezeTimeouts() {
  try {
    console.log(
      "[Risk Management] Restoring freeze timeouts after server restart"
    );

    // Find all active freeze records
    const activeFreezesRecords = await Freeze.find({ active: true });

    if (activeFreezesRecords.length === 0) {
      console.log("[Risk Management] No active freeze records found");
      return;
    }

    console.log(
      `[Risk Management] Found ${activeFreezesRecords.length} active freeze records`
    );

    for (const record of activeFreezesRecords) {
      const { groupId, accountId } = record;
      const releaseTime = record.releaseTime as Date;

      // Check if the release time has already passed
      if (new Date() >= releaseTime) {
        // If the release time has passed, unfreeze immediately
        console.log(
          `[Risk Management] Release time already passed for account ${accountId}, unfreezing immediately`
        );
        await unfreezeAccount(groupId, accountId);
        continue;
      }

      // Calculate the remaining time until release
      const remainingTime = releaseTime.getTime() - Date.now();

      console.log(
        `[Risk Management] Restoring freeze timeout for account ${accountId}, will release in ${
          remainingTime / 1000
        } seconds`
      );

      // Initialize the frozen accounts structure if needed
      if (!CacheManager.getInstance().getFrozenAccounts()[groupId]) {
        CacheManager.getInstance().getFrozenAccounts()[groupId] = {};
      }

      // Set a new timeout for the remaining duration
      const releaseTimeout = setTimeout(() => {
        unfreezeAccount(groupId, accountId);
      }, remainingTime);

      // Store the account in the cache with the new timeout
      CacheManager.getInstance().getFrozenAccounts()[groupId][accountId] = {
        accountId: record.accountId,
        frozenAt: record.frozenAt,
        initialEquity: record.initialEquity,
        releaseTime: record.releaseTime,
        reason: record.reason,
        _releaseTimeout: releaseTimeout,
      };
    }

    console.log("[Risk Management] Freeze timeouts restored successfully");
  } catch (error) {
    console.error("[Risk Management] Error restoring freeze timeouts:", error);
  }
}

// Add a cleanup function for frozen accounts when disconnecting
export async function cleanupFrozenAccount(groupId: string, accountId: string) {
  if (CacheManager.getInstance().getFrozenAccounts()[groupId]?.[accountId]) {
    const frozenAccount =
      CacheManager.getInstance().getFrozenAccounts()[groupId][accountId];
    if (frozenAccount._releaseTimeout) {
      clearTimeout(frozenAccount._releaseTimeout);
    }

    // Check if this is the only account in the group
    if (
      Object.keys(CacheManager.getInstance().getFrozenAccounts()[groupId])
        .length === 1
    ) {
      delete CacheManager.getInstance().getFrozenAccounts()[groupId];
    } else {
      delete CacheManager.getInstance().getFrozenAccounts()[groupId][accountId];
    }

    // Update any active freeze records in MongoDB
    try {
      await Freeze.updateMany(
        { accountId, active: true },
        { $set: { active: false, releasedAt: new Date() } }
      );
      console.log(
        `[Risk Management] Cleaned up freeze records in MongoDB for account ${groupId}:${accountId}`
      );
    } catch (error) {
      console.error(
        `[Risk Management] Error updating freeze records in MongoDB:`,
        error
      );
    }
  }
}

// Function to restore tracker event listeners on server restart
export async function restoreTrackerEventListeners() {
  try {
    console.log(
      "[Risk Management] Restoring tracker event listeners after server restart"
    );

    // Find all active participants
    const participants = await GroupParticipant.find({
      status: { $ne: "removed" },
      trackerId: { $exists: true, $ne: null },
    });

    if (participants.length === 0) {
      console.log("[Risk Management] No active trackers found");
      return;
    }

    console.log(
      `[Risk Management] Found ${participants.length} active trackers to restore`
    );

    for (const participant of participants) {
      try {
        // Don't recreate listeners for frozen accounts - they'll get new trackers when unfrozen
        const isFrozen = await Freeze.findOne({
          groupId: participant.groupId,
          accountId: participant.accountId,
          active: true,
        });

        if (isFrozen) {
          console.log(
            `[Risk Management] Account ${participant.accountId} is frozen, skipping tracker restore`
          );
          continue;
        }

        console.log(
          `[Risk Management] Restoring tracker for account ${participant.accountId}`
        );

        // Skip if trackerId is missing
        if (!participant.trackerId) {
          console.log(
            `[Risk Management] No trackerId found for ${participant.accountId}, creating new tracker`
          );
          // Create a new tracker since the existing one is invalid
          await createNewTracker(
            participant.groupId.toString(),
            participant.accountId
          );
          continue;
        }

        // Try to verify the tracker exists and is valid
        try {
          // Attempt to get the tracker - if it fails, we'll recreate it
          await riskManagement.riskManagementApi.getTracker(
            participant.accountId,
            participant.trackerId
          );

          // Create a new event listener if the tracker is valid
          const eventListener = new EventTracker(
            participant.accountId,
            participant.trackerId
          );

          // Register the event listener
          const eventListenerId =
            riskManagement.riskManagementApi.addTrackerEventListener(
              eventListener,
              participant.accountId,
              participant.trackerId
            );

          // Update the listenerId in the database
          await GroupParticipant.updateOne(
            { _id: participant._id },
            { $set: { listenerId: eventListenerId } }
          );

          console.log(
            `[Risk Management] Restored tracker listener for ${participant.accountId}`
          );
        } catch (error) {
          console.error(
            `[Risk Management] Error validating tracker for ${participant.accountId}, creating new one:`,
            error
          );
          // Create a new tracker since the existing one is invalid
          await createNewTracker(
            participant.groupId.toString(),
            participant.accountId
          );
          continue;
        }
      } catch (error) {
        console.error(
          `[Risk Management] Error restoring tracker for ${participant.accountId}:`,
          error
        );
      }
    }

    console.log(
      "[Risk Management] Tracker event listeners restored successfully"
    );
  } catch (error) {
    console.error(
      "[Risk Management] Error restoring tracker event listeners:",
      error
    );
  }
}
