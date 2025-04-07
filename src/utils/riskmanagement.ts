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

export async function checkAccountRisk(
  groupId: string,
  accountId: string,
  accountInfo: any
) {
  if (CacheManager.getInstance().getFrozenAccounts()[groupId]?.[accountId]) {
    return;
  }

  const equity = accountInfo.equity;

  // Initialize equity tracking if not exists
  if (!accountEquityHistory[groupId]) {
    accountEquityHistory[groupId] = {};
  }

  if (!accountEquityHistory[groupId][accountId]) {
    accountEquityHistory[groupId][accountId] = {
      lastRecordedEquity: equity,
      initialEquity: equity,
      equityHighWatermark: equity,
      currentProfitLossPercent: 0, // Initialize with 0%
    };
    console.log(
      `[Risk Management] Initialized equity tracking for account ${groupId}:${accountId}: ${equity}`
    );
    return;
  }

  // Update high watermark if equity is higher than before
  if (equity > accountEquityHistory[groupId][accountId].equityHighWatermark) {
    accountEquityHistory[groupId][accountId].equityHighWatermark = equity;
  }

  // Calculate loss percentage from high watermark
  const highWatermark =
    accountEquityHistory[groupId][accountId].equityHighWatermark;
  const lossPercentage = ((highWatermark - equity) / highWatermark) * 100;

  // Calculate overall profit/loss percentage from balance
  const balance = accountInfo.balance;
  const profitLossPercent =
    balance > 0 ? ((equity - balance) / balance) * 100 : 0;

  // Update tracking data
  accountEquityHistory[groupId][accountId].lastRecordedEquity = equity;
  accountEquityHistory[groupId][accountId].currentProfitLossPercent =
    profitLossPercent;

  // Check if loss exceeds threshold
  if (lossPercentage >= EQUITY_LOSS_THRESHOLD) {
    await freezeAccount(
      groupId,
      accountId,
      `${lossPercentage.toFixed(2)}% equity loss detected`,
      true // Automated freeze
    );
  }
}

export async function freezeAccount(
  groupId: string,
  accountId: string,
  reason: string,
  automated: boolean = false
) {
  try {
    if (CacheManager.getInstance().getFrozenAccounts()[groupId]?.[accountId]) {
      return;
    }

    const connection = activeConnections.find(
      (conn) => conn.accountId === accountId
    );
    if (!connection) {
      console.error(
        `Cannot freeze account ${accountId}: not found in active connections`
      );
      return;
    }
    if (connection.connection.status !== "connected") {
      console.error(
        `Cannot freeze account ${accountId}: connection is not connected`
      );
      await connection.connection.connect();
    }
    const equity =
      connection.connection.terminalState.accountInformation.equity;

    console.log(
      `[Risk Management] Freezing account ${accountId} for 1 hour due to: ${reason}`
    );
    handleCloseAllOrders(groupId, accountId);
    handleCloseAllPositions(groupId, accountId);

    const group = CacheManager.getInstance().getGroup(groupId);
    if (!group) {
      console.error(
        `Group ${groupId} not found in cache, ignoring freeze event`
      );
      return;
    }
    // Add to frozen accounts
    const releaseTimeout = setTimeout(() => {
      unfreezeAccount(groupId, accountId);
    }, group.freezeDuration);

    const releaseTimeoutId = releaseTimeout[Symbol.toPrimitive]
      ? releaseTimeout[Symbol.toPrimitive]()
      : null;

    if (!CacheManager.getInstance().getFrozenAccounts()[groupId]) {
      CacheManager.getInstance().getFrozenAccounts()[groupId] = {};
    }

    const releaseTime = new Date(Date.now() + group.freezeDuration);

    CacheManager.getInstance().getFrozenAccounts()[groupId][accountId] = {
      accountId,
      frozenAt: new Date(),
      initialEquity: equity,
      releaseTime,
      reason,
      _releaseTimeout: releaseTimeout,
    };

    const freezeRecord = new Freeze({
      accountId,
      reason,
      automated,
      groupId,
      initialEquity: equity,
      frozenAt: new Date(),
      releaseTime,
      active: true,
    });

    await freezeRecord.save();
    console.log(
      `[Risk Management] Saved freeze record to MongoDB for account ${accountId}`
    );

    console.log(
      `[Risk Management] Account ${accountId} is now frozen until ${releaseTime.toISOString()}`
    );
  } catch (error) {
    console.log(
      `[Risk Management] Error freezing account ${accountId}:`,
      error
    );
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

    // Force a refresh of trading data for this account
    const cacheManager = CacheManager.getInstance();
    const participant = cacheManager.getParticipant(accountId);

    if (participant && connection) {
      try {
        const terminalState = connection.connection.terminalState;
        if (terminalState && terminalState.accountInformation) {
          const accountInfo = terminalState.accountInformation;
          const balance = accountInfo.balance || 0;
          const equity = accountInfo.equity || 0;
          const pnlPercentage =
            balance > 0 ? ((equity - balance) / balance) * 100 : 0;

          participant.balance = balance;
          participant.equity = equity;
          participant.pnlPercentage = parseFloat(pnlPercentage.toFixed(2));
          participant.profitLoss = equity - balance;
          participant.positions = terminalState.positions || [];
          participant.orders = terminalState.orders || [];

          // Also update the participant in the group's participants array
          const group = cacheManager.getGroup(groupId);
          if (group) {
            const participantIndex = group.participants.findIndex(
              (p) => p.accountId === accountId
            );
            if (participantIndex !== -1) {
              group.participants[participantIndex].balance = balance;
              group.participants[participantIndex].equity = equity;
              group.participants[participantIndex].pnlPercentage = parseFloat(
                pnlPercentage.toFixed(2)
              );
              group.participants[participantIndex].profitLoss =
                equity - balance;
              group.participants[participantIndex].positions =
                terminalState.positions || [];
              group.participants[participantIndex].orders =
                terminalState.orders || [];

              console.log(
                `[Risk Management] Updated group participant data for account ${accountId} in group ${groupId}`
              );
            }
          }

          console.log(
            `[Risk Management] Updated trading data for account ${accountId} after unfreeze`
          );
        }
      } catch (dataRefreshError) {
        console.error(
          `[Risk Management] Error refreshing trading data for account ${accountId}:`,
          dataRefreshError
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
