import { orderHistory, orderPositionMapping } from "../constants/global";
import { CacheManager } from "../utils/cacheManager";
import {
  handleCloseAllOrders,
  handleCloseAllPositions,
} from "../utils/riskmanagement";

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

    // if (accountInformation && typeof accountInformation.equity === "number") {
    //   checkAccountRisk(this.groupId, this.accountId, accountInformation);
    // }
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
