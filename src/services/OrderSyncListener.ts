import { CacheManager } from "../utils/cacheManager";
import {
  handleCloseAllOrders,
  handleCloseAllPositions,
} from "../utils/riskmanagement";
import { activeConnections } from "../constants/global";

export class OrderSyncListener {
  accountId: string;
  groupId: string;

  constructor(groupId: string, accountId: string) {
    this.groupId = groupId;
    this.accountId = accountId;
  }

  onAccountInformationUpdated(accountInformation: any) {
    console.log(
      `[Account: ${this.groupId}:${this.accountId}] Account information updated:`,
      accountInformation
    );

    if (accountInformation && typeof accountInformation.equity === "number") {
      // Update trading data in the cache immediately
      const participant = CacheManager.getInstance().getParticipant(
        this.accountId
      );
      if (participant) {
        const balance = accountInformation.balance || 0;
        const equity = accountInformation.equity || 0;

        // Update participant in the participants map
        participant.balance = balance;
        participant.equity = equity;

        const group = CacheManager.getInstance().getGroup(this.groupId);
        if (group) {
          const pnlPercentage =
            balance > 0
              ? ((equity - group.initialBalance) / group.initialBalance) * 100
              : 0;
          participant.profitLoss = equity - group.initialBalance;
          participant.pnlPercentage = parseFloat(pnlPercentage.toFixed(2));
          const participantIndex = group.participants.findIndex(
            (p) => p.accountId === this.accountId
          );
          if (participantIndex !== -1) {
            group.participants[participantIndex].balance = balance;
            group.participants[participantIndex].equity = equity;
            group.participants[participantIndex].pnlPercentage = parseFloat(
              pnlPercentage.toFixed(2)
            );
            group.participants[participantIndex].profitLoss =
              equity - group.initialBalance;
          }
        }
      }
    }
  }

  onOrderUpdated(order: any) {
    if (
      CacheManager.getInstance().getFrozenAccounts()[this.groupId]?.[
        this.accountId
      ]
    ) {
      handleCloseAllOrders(this.groupId, this.accountId);
    }
  }

  onOrdersReplaced(orders: any[]) {
    console.log(
      `[Account: ${this.groupId}:${this.accountId}] All orders replaced. Count: ${orders.length}`
    );
    if (
      CacheManager.getInstance().getFrozenAccounts()[this.groupId]?.[
        this.accountId
      ]
    ) {
      handleCloseAllOrders(this.groupId, this.accountId);
    }
  }

  onOrderCompleted(orderId: string, order: any) {
    console.log(
      `[Account: ${this.groupId}:${this.accountId}] Order completed: ${orderId}`,
      order
    );
  }

  onPositionUpdated(positionId: string, position: any) {
    console.log(
      `[Account: ${this.groupId}:${this.accountId}] Position updated: ${positionId}`,
      position
    );
    const frozenAccount =
      CacheManager.getInstance().getFrozenAccounts()[this.groupId]?.[
        this.accountId
      ];
    if (frozenAccount && frozenAccount.active) {
      handleCloseAllPositions(this.groupId, this.accountId);
    }

    // Update positions in cache
    const connection = activeConnections.find(
      (conn) =>
        conn.accountId === this.accountId && conn.groupId === this.groupId
    );

    if (connection && connection.connection) {
      const terminalState = connection.connection.terminalState;
      if (terminalState && terminalState.positions) {
        CacheManager.getInstance().setPositions(
          this.accountId,
          terminalState.positions
        );
      }
    }
  }

  onPositionsReplaced(positions: any[]) {
    console.log(
      `[Account: ${this.groupId}:${this.accountId}] All positions replaced. Count: ${positions.length}`
    );
    const frozenAccount =
      CacheManager.getInstance().getFrozenAccounts()[this.groupId]?.[
        this.accountId
      ];
    if (frozenAccount && frozenAccount.active) {
      handleCloseAllPositions(this.groupId, this.accountId);
    }
    if (
      CacheManager.getInstance().getFrozenAccounts()[this.groupId]?.[
        this.accountId
      ]
    ) {
      handleCloseAllPositions(this.groupId, this.accountId);
    }

    // Update positions in cache directly
    CacheManager.getInstance().setPositions(this.accountId, positions);

    // Force refresh account data to get updated equity/balance
    CacheManager.getInstance()
      .forceRefreshAccountData(this.groupId, this.accountId)
      .catch((error) => {
        console.error(
          `Error refreshing account data after positions update: ${error}`
        );
      });
  }

  onDealAdded(dealId: string, deal: any) {
    const historyEntry = {
      ...deal,
      dealId,
      recordedAt: new Date().toISOString(),
    };
    if (deal.comment === "RM Emergency Close") {
      return;
    }
    CacheManager.getInstance().addDeal(this.accountId, deal);
  }

  onConnected() {}
  onDisconnected() {}
  onPositionsUpdated(positions: any) {}
  onPositionRemoved(positionId: string) {}
  onPositionsSynchronized(positions: any) {}
  onHistoryOrderAdded(order: any) {}
  onHealthStatus(healthStatus: any) {}
  onDealsSynchronized(deals: any) {}
  onHistoryOrdersSynchronized(orders: any) {}
  onPendingOrdersReplaced(orders: any) {}
  onPendingOrdersSynchronized(orders: any) {}
  onSynchronizationComplete() {}
  onSymbolPricesUpdated(symbolPrices: any) {}
  onBrokerConnectionStatusChanged(status: any) {}
  onSymbolSpecificationUpdated(symbol: any) {}
  onSymbolSpecificationsUpdated(symbol: any) {}
  onSynchronizationStopped() {}
  onSymbolPriceUpdated(symbol: string, price: any) {}
  onSynchronizationStarted() {}
}
