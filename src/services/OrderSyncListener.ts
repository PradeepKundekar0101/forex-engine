import { orderHistory, orderPositionMapping } from "../constants/global";
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

    if (!orderHistory[groupId]) {
      orderHistory[groupId] = {};
    }
    if (!orderHistory[groupId][accountId]) {
      orderHistory[groupId][accountId] = [];
    }

    if (!orderPositionMapping[groupId]) {
      orderPositionMapping[groupId] = {};
    }
    if (!orderPositionMapping[groupId][accountId]) {
      orderPositionMapping[groupId][accountId] = {};
    }
  }

  onAccountInformationUpdated(accountInformation: any) {
    console.log(
      `[Account: ${this.groupId}:${this.accountId}] Account information updated:`,
      accountInformation
    );

    if (accountInformation && typeof accountInformation.equity === "number") {
      // checkAccountRisk(this.groupId, this.accountId, accountInformation);

      // Update trading data in the cache immediately
      const participant = CacheManager.getInstance().getParticipant(
        this.accountId
      );
      if (participant) {
        const balance = accountInformation.balance || 0;
        const equity = accountInformation.equity || 0;
        const pnlPercentage =
          balance > 0 ? ((equity - balance) / balance) * 100 : 0;

        // Update participant in the participants map
        participant.balance = balance;
        participant.equity = equity;
        participant.pnlPercentage = parseFloat(pnlPercentage.toFixed(2));
        participant.profitLoss = equity - balance;

        // Also update the participant in the group's participants array
        const group = CacheManager.getInstance().getGroup(this.groupId);
        if (group) {
          const participantIndex = group.participants.findIndex(
            (p) => p.accountId === this.accountId
          );
          if (participantIndex !== -1) {
            group.participants[participantIndex].balance = balance;
            group.participants[participantIndex].equity = equity;
            group.participants[participantIndex].pnlPercentage = parseFloat(
              pnlPercentage.toFixed(2)
            );
            group.participants[participantIndex].profitLoss = equity - balance;
          }
        }
      }
    }
  }

  onOrderUpdated(order: any) {
    if (order.positionId) {
      if (!orderPositionMapping[this.groupId][this.accountId]) {
        orderPositionMapping[this.groupId][this.accountId] = {};
      }
      orderPositionMapping[this.groupId][this.accountId][order.positionId] =
        order.id;
    }

    if (
      CacheManager.getInstance().getFrozenAccounts()[this.groupId]?.[
        this.accountId
      ]
    ) {
      handleCloseAllOrders(this.groupId, this.accountId);
    }

    // Update orders in cache
    const connection = activeConnections.find(
      (conn) =>
        conn.accountId === this.accountId && conn.groupId === this.groupId
    );

    if (connection && connection.connection) {
      const terminalState = connection.connection.terminalState;
      if (terminalState && terminalState.orders) {
        CacheManager.getInstance().setOrders(
          this.accountId,
          terminalState.orders
        );
      }
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

    // Update orders in cache directly
    CacheManager.getInstance().setOrders(this.accountId, orders);

    // Force refresh account data to get updated equity/balance
    CacheManager.getInstance()
      .forceRefreshAccountData(this.groupId, this.accountId)
      .catch((error) => {
        console.error(
          `Error refreshing account data after orders update: ${error}`
        );
      });
  }

  onOrderCompleted(orderId: string, order: any) {
    console.log(
      `[Account: ${this.groupId}:${this.accountId}] Order completed: ${orderId}`,
      order
    );

    // Add to order history
    if (order) {
      if (!orderHistory[this.groupId][this.accountId]) {
        orderHistory[this.groupId][this.accountId] = [];
      }
      order.completedAt = new Date().toISOString();
      orderHistory[this.groupId][this.accountId].push(order);

      // Keep history limited to last 100 orders
      if (orderHistory[this.groupId][this.accountId].length > 100) {
        orderHistory[this.groupId][this.accountId] =
          orderHistory[this.groupId][this.accountId].slice(-100);
      }
    }

    // If this order created a position, store the relationship
    if (order && order.positionId) {
      if (!orderPositionMapping[this.groupId][this.accountId]) {
        orderPositionMapping[this.groupId][this.accountId] = {};
      }
      const fullPositionId = order.positionId;
      orderPositionMapping[this.groupId][this.accountId][fullPositionId] =
        orderId;
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
    // Initialize deals history if it doesn't exist
    if (!orderHistory[this.groupId][this.accountId].deals) {
      orderHistory[this.groupId][this.accountId].deals = [];
    }

    orderHistory[this.groupId][this.accountId].deals.push(historyEntry);

    // If the deal has both order and position IDs, track the relationship
    if (deal.orderId && deal.positionId) {
      if (!orderPositionMapping[this.groupId][this.accountId]) {
        orderPositionMapping[this.groupId][this.accountId] = {};
      }
      // Make sure to use the full position ID
      const fullPositionId = deal.id || deal.positionId;
      orderPositionMapping[this.groupId][this.accountId][fullPositionId] =
        deal.orderId;
      console.log(
        `[Risk Management] Mapped position ${fullPositionId} to order ${deal.orderId} from deal`
      );
    }
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
