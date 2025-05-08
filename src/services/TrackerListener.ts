import { TrackerEventListener } from "metaapi.cloud-sdk";
import { TrackerEvent } from "metaapi.cloud-sdk/dist/riskManagement";
import { CacheManager } from "../utils/cacheManager";
import { freezeAccount } from "../utils/riskmanagement";
import { riskManagement } from "../constants/global";
import GroupParticipant from "../models/groupParticipant";

export class EventTracker extends TrackerEventListener {
  constructor(accountId: string, trackerId: string) {
    super(accountId, trackerId);
  }
  async onTrackerEvent(trackerEvent: TrackerEvent) {
    console.log("Tracker event", trackerEvent);
    if (trackerEvent.exceededThresholdType == "drawdown") {
      const trackerId = trackerEvent.trackerId;
      const accountId = trackerId.split(":")[0];
      const groupId = trackerId.split(":")[1];
      const participant = CacheManager.getInstance().getParticipant(accountId);
      if (
        participant &&
        !CacheManager.getInstance().getFrozenAccounts()[groupId]?.[accountId]
      ) {
        freezeAccount(
          groupId,
          accountId,
          "Drawdown",
          true,
          participant.freezeDuration
        );
        const groupParticipant = await GroupParticipant.findOne({
          groupId: groupId,
          accountId: accountId,
        });
        if (groupParticipant) {
          riskManagement.riskManagementApi.removeTrackerEventListener(
            groupParticipant.listenerId || ""
          );
        }
      }
    }
    return Promise.resolve();
  }
}
