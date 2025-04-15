import { api } from "../constants/global";
import { activeConnections } from "../constants/global";
import { CacheManager } from "./cacheManager";
import Freeze from "../models/frozenAccount";

export const handleCloseAllPositions = async (
  groupId: string,
  accountId: string
) => {
  // Risk management disabled - no position closing
  console.log("Risk management disabled - not closing positions");
  return;
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
  automated: boolean = false
) {
  try {
    const group = CacheManager.getInstance().getGroup(groupId);
    if (!group) {
      throw new Error("Group not found");
    }
    const releaseTime = new Date(Date.now() + group.freezeDuration);
    CacheManager.getInstance().getFrozenAccounts()[groupId][accountId] = {
      accountId,
      frozenAt: new Date(),
      releaseTime,
      reason,
      automated,
    };
    const equity = (
      await api.metatraderAccountApi.getAccount(accountId)
    ).getStreamingConnection().terminalState.accountInformation.equity;
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
  if (!CacheManager.getInstance().getFrozenAccounts()[groupId]?.[accountId]) {
    return;
  }

  console.log(`[Risk Management] Unfreezing account ${accountId}`);

  // Remove from frozen accounts
  const frozenAccount =
    CacheManager.getInstance().getFrozenAccounts()[groupId][accountId];
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
  // Risk management disabled - don't restore freeze timeouts
  console.log("[Risk Management] Freeze functionality has been disabled");
  return;
}

// Function to unfreeze all accounts
export async function unfreezeAllAccounts() {
  try {
    console.log(
      "[Risk Management] Restoring freeze timeouts after server restart"
    );

    const activeFreezesRecords = await Freeze.find({ active: true });
    if (activeFreezesRecords.length === 0) {
      console.log("[Risk Management] No active freeze records found");
      return;
    }
    console.log(
      `[Risk Management] Found ${activeFreezesRecords.length} active freeze records to unfreeze`
    );
    for (const record of activeFreezesRecords) {
      const { groupId, accountId } = record;
      const releaseTime = record.releaseTime as Date;
      if (new Date() >= releaseTime) {
        console.log(
          `[Risk Management] Release time already passed for account ${accountId}, unfreezing immediately`
        );
        await unfreezeAccount(groupId, accountId);
        continue;
      }
      const remainingTime = releaseTime.getTime() - Date.now();

      console.log(
        `[Risk Management] Unfreezing account ${accountId} in group ${groupId}`
      );

      if (!CacheManager.getInstance().getFrozenAccounts()[groupId]) {
        CacheManager.getInstance().getFrozenAccounts()[groupId] = {};
      }

      const releaseTimeout = setTimeout(() => {
        unfreezeAccount(groupId, accountId);
      }, remainingTime);

      CacheManager.getInstance().getFrozenAccounts()[groupId][accountId] = {
        accountId: record.accountId,
        frozenAt: record.frozenAt,
        initialEquity: record.initialEquity,
        releaseTime: record.releaseTime,
        reason: record.reason,
        _releaseTimeout: releaseTimeout,
      };
    }

    console.log("[Risk Management] All accounts unfrozen successfully");
  } catch (error) {
    console.error("[Risk Management] Error unfreezing all accounts:", error);
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
