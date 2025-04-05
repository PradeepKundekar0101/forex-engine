import {
  counterTradeTracking,
  frozenAccounts,
  orderHistory,
  orderPositionMapping,
} from "../constants/global";
import { CacheManager } from "../utils/cacheManager";

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
      // CacheManager.getInstance().setOrders(this.accountId, order);
      orderPositionMapping[this.groupId][this.accountId][order.positionId] =
        order.id;
    }

    // Check if account is frozen, if so, perform counter trade
    if (frozenAccounts[this.groupId]?.[this.accountId]) {
      // Check if this is our own counter order
      if (order.comment && order.comment.includes("RM Counter")) {
        console.log(
          `[Risk Management] Order ${order.id} is a counter order, skipping to prevent loops`
        );
      } else {
        // handleCounterOrder(this.groupId, this.accountId, order, "syncListener");
      }
    }
  }

  onOrdersReplaced(orders: any[]) {
    console.log(
      `[Account: ${this.groupId}:${this.accountId}] All orders replaced. Count: ${orders.length}`
    );
    if (frozenAccounts[this.groupId]?.[this.accountId]) {
      for (const order of orders) {
        // handleCounterOrder(this.groupId, this.accountId, order, "syncListener");
      }
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

    // If account is frozen, place a counter position
    if (frozenAccounts[this.groupId]?.[this.accountId]) {
      // Check if this is our own counter position first
      if (position.comment && position.comment.includes("RM Counter")) {
        console.log(
          `[Risk Management] Position ${positionId} is a counter position, skipping to prevent loops`
        );
      } else {
        // Check if this position was created by an order we've already countered
        const relatedOrderId =
          orderPositionMapping[this.groupId][this.accountId]?.[positionId];
        const orderCounterTrackingId = relatedOrderId
          ? `order_${relatedOrderId}`
          : null;

        // Only process if we haven't already countered a related order
        if (
          orderCounterTrackingId &&
          counterTradeTracking[this.groupId]?.[this.accountId]?.has(
            orderCounterTrackingId
          )
        ) {
          console.log(
            `[Risk Management] Position ${positionId} came from order ${relatedOrderId} which was already countered, skipping`
          );
        } else {
          //   handleCounterPosition(
          //     this.groupId,
          //     this.accountId,
          //     positionId,
          //     position,
          //     "syncListener"
          //   );
        }
      }
    }
  }

  onPositionsReplaced(positions: any[]) {
    console.log(
      `[Account: ${this.groupId}:${this.accountId}] All positions replaced. Count: ${positions.length}`
    );

    // Check if account is frozen, if so, perform counter trades
    if (frozenAccounts[this.groupId]?.[this.accountId]) {
      // Process all positions for counter trades
      for (const position of positions) {
        // handleCounterPosition(
        //   this.groupId,
        //   this.accountId,
        //   position.id,
        //   position,
        //   "syncListener"
        // );
      }
    }
  }

  onDealAdded(dealId: string, deal: any) {
    const historyEntry = {
      ...deal,
      dealId,
      recordedAt: new Date().toISOString(),
    };
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
