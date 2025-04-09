import { api } from "../constants/global";
import {
  activeConnections,
  accountEquityHistory,
  EQUITY_LOSS_THRESHOLD,
} from "../constants/global";
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

export async function checkAccountRisk(
  groupId: string,
  accountId: string,
  accountInfo: any
) {
  // Risk management disabled - no account risk checking
  return;
}

export async function freezeAccount(
  groupId: string,
  accountId: string,
  reason: string,
  automated: boolean = false
) {
  // Risk management disabled - no account freezing
  console.log("Risk management disabled - not freezing account");
  return;
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

    // Force reconnect to account to ensure fresh data
    let connection = activeConnections.find(
      (conn) => conn.accountId === accountId && conn.groupId === groupId
    );

    if (!connection) {
      console.log(
        `[Risk Management] Reconnecting to account ${accountId} after unfreeze`
      );
      try {
        const { connectToAccount } = require("./account");
        connection = await connectToAccount(accountId, groupId);
      } catch (reconnectError) {
        console.error(
          `[Risk Management] Error reconnecting to account ${accountId} after unfreeze:`,
          reconnectError
        );
      }
    } else if (connection.connection.status !== "connected") {
      console.log(
        `[Risk Management] Reconnecting existing connection for account ${accountId}`
      );
      try {
        await connection.connection.connect();
        await connection.connection.waitSynchronized();
      } catch (reconnectError) {
        console.error(
          `[Risk Management] Error reconnecting existing connection for account ${accountId}:`,
          reconnectError
        );
      }
    }
  } catch (error) {
    console.error(
      `[Risk Management] Error updating freeze records in MongoDB:`,
      error
    );
  }
}

// Function to restore freeze timeouts on server restart
export async function restoreFreezeTimeouts() {
  // Risk management disabled - don't restore freeze timeouts
  console.log("[Risk Management] Freeze functionality has been disabled");
  return;
}

// Function to unfreeze all accounts
export async function unfreezeAllAccounts() {
  try {
    console.log("[Risk Management] Unfreezing all accounts immediately");

    // Find all active freeze records
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
      console.log(
        `[Risk Management] Unfreezing account ${accountId} in group ${groupId}`
      );
      await unfreezeAccount(groupId, accountId);
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

  // Clean up equity history
  if (accountEquityHistory[groupId]?.[accountId]) {
    // Check if this is the only account in the group
    if (Object.keys(accountEquityHistory[groupId]).length === 1) {
      delete accountEquityHistory[groupId];
    } else {
      delete accountEquityHistory[groupId][accountId];
    }
  }
}
