import { TrackerEventListener } from "metaapi.cloud-sdk";
import { freezeAccount } from "../utils/riskmanagement";
import { CacheManager } from "../utils/cacheManager";
import { EQUITY_LOSS_THRESHOLD } from "../constants/global";

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
      // Handle different types of tracker events
      if (trackerEvent.type === "drawdown") {
        await this.handleDrawdownEvent(trackerEvent);
      } else if (trackerEvent.type === "period-ended") {
        await this.handlePeriodEndedEvent(trackerEvent);
      }
    } catch (error) {
      console.error(
        `Error handling tracker event for account ${this.accountId}:`,
        error
      );
    }
  }

  private async handleDrawdownEvent(trackerEvent: any) {
    const drawdownPercent = trackerEvent.drawdownPercent || 0;

    console.log(
      `[Risk Management] Drawdown event detected for account ${
        this.accountId
      }: ${drawdownPercent.toFixed(2)}%`
    );

    if (drawdownPercent >= EQUITY_LOSS_THRESHOLD) {
      const reason = `${drawdownPercent.toFixed(
        2
      )}% drawdown detected by risk management tracker`;
      await freezeAccount(this.groupId, this.accountId, reason, true);
    }
  }

  private async handlePeriodEndedEvent(trackerEvent: any) {
    // Check if there was a significant loss in the period
    const equityChange = trackerEvent.equityChange || 0;
    const equityChangePercent = trackerEvent.equityChangePercent || 0;

    console.log(
      `[Risk Management] Period ended for account ${
        this.accountId
      } with equity change: ${equityChangePercent.toFixed(2)}%`
    );

    // If loss meets or exceeds our threshold, freeze the account
    if (equityChangePercent <= -EQUITY_LOSS_THRESHOLD) {
      const reason = `${Math.abs(equityChangePercent).toFixed(
        2
      )}% loss detected over tracking period`;
      await freezeAccount(this.groupId, this.accountId, reason, true);
    }
  }
}
