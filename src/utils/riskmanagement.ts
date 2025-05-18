import { api } from "../constants/global";
import { activeConnections } from "../constants/global";
import { CacheManager } from "./cacheManager";
import Freeze from "../models/frozenAccount";
import Group from "../models/group";

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
    const connection = (
      await api.metatraderAccountApi.getAccount(accountId)
    ).getStreamingConnection();
    const equity = connection.terminalState.accountInformation.equity;

    // Close all positions and orders
    await handleCloseAllPositions(groupId, accountId);
    await handleCloseAllOrders(groupId, accountId);

    await Freeze.create({
      groupId,
      accountId,
      frozenAt: new Date(),
      releaseTime,
      reason,
      automated,
      initialEquity: equity,
    });
    return equity;
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
  } catch (error) {
    console.error(
      `[Risk Management] Error updating freeze records in MongoDB:`,
      error
    );
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
