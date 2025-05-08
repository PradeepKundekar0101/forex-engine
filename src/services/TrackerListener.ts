import { TrackerEventListener } from "metaapi.cloud-sdk";
import { TrackerEvent } from "metaapi.cloud-sdk/dist/riskManagement";
import { CacheManager } from "../utils/cacheManager";
import { freezeAccount } from "../utils/riskmanagement";
import { riskManagement } from "../constants/global";
import GroupParticipant from "../models/groupParticipant";

export class EventTracker extends TrackerEventListener {
  constructor(accountId: string, trackerId: string) {
    console.log("Tracker listener constructor", accountId, trackerId);
    super(accountId, trackerId);
  }
  async onTrackerEvent(trackerEvent: TrackerEvent) {
    console.log("Tracker event", trackerEvent);
    if (trackerEvent.exceededThresholdType == "drawdown") {
      // Get the tracker details to extract the name which contains accountId:groupId
      try {
        const tracker = await riskManagement.riskManagementApi.getTracker(
          this.accountId,
          trackerEvent.trackerId
        );

        console.log("Got tracker details:", tracker);

        // Extract accountId and groupId from tracker name
        if (tracker && tracker.name && tracker.name.includes(":")) {
          const [accountId, groupId] = tracker.name.split(":");

          console.log(`Parsed accountId: ${accountId}, groupId: ${groupId}`);

          const participant =
            CacheManager.getInstance().getParticipant(accountId);
          if (
            participant &&
            !CacheManager.getInstance().getFrozenAccounts()[groupId]?.[
              accountId
            ]
          ) {
            console.log(
              `Freezing account ${accountId} due to drawdown of ${
                trackerEvent.relativeDrawdown || 0
              }%`
            );

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
          } else {
            console.log(
              `Participant not found or account already frozen. Participant: ${!!participant}, Frozen: ${!!CacheManager.getInstance().getFrozenAccounts()[
                groupId
              ]?.[accountId]}`
            );
          }
        } else {
          console.error(`Invalid tracker name format: ${tracker?.name}`);
        }
      } catch (error) {
        console.error("Error processing drawdown event:", error);
      }
    }
    return Promise.resolve();
  }
}
