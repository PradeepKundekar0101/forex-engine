import { TrackerEventListener } from "metaapi.cloud-sdk";
import { freezeAccount } from "../utils/riskmanagement";
import { CacheManager } from "../utils/cacheManager";

export class Listener extends TrackerEventListener {
  private groupId: string;

  constructor(groupId: string, accountId: string) {
    super(groupId, accountId);
    this.groupId = groupId;
  }

  async onTrackerEvent(trackerEvent: any) {
    console.log("Tracker event", trackerEvent);

    // Check if the account is already frozen
    const frozenAccounts = CacheManager.getInstance().getFrozenAccounts();
    if (frozenAccounts[this.groupId]?.[this.accountId]) {
      console.log(
        `Account ${this.accountId} is already frozen, ignoring tracker event`
      );
      return;
    }

    try {
      await this.handleDrawdownEvent(trackerEvent);
    } catch (error) {
      console.error(
        `Error handling tracker event for account ${this.accountId}:`,
        error
      );
    }
  }

  private async handleDrawdownEvent(trackerEvent: any) {
    console.log("handleDrawdownEvent", trackerEvent);
    const drawdownPercent = trackerEvent.drawdownPercent || 0;
    console.log("drawdownPercent", drawdownPercent);
    console.log(
      `[Risk Management] Drawdown event detected for account ${
        this.accountId
      }: ${drawdownPercent.toFixed(2)}%`
    );
    const group = CacheManager.getInstance().getGroup(this.groupId);
    if (!group) {
      console.error(
        `Group ${this.groupId} not found in cache, ignoring drawdown event`
      );
      return;
    }
    if (drawdownPercent >= group.freezeThreshold) {
      const reason = `${drawdownPercent.toFixed(
        2
      )}% drawdown detected by risk management tracker`;
      await freezeAccount(this.groupId, this.accountId, reason, true);
    }
  }
}
