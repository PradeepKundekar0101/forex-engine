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
  }

  onConnected() {}
  onDisconnected() {}
  onOrdersReplaced(orders: any[]) {}
  onOrderCompleted(orderId: string, order: any) {}
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
