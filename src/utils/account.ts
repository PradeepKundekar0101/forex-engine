import {
  activeConnections,
  api,
  riskManagement,
  trackers,
} from "../constants/global";
import { OrderSyncListener } from "../services/OrderSyncListener";
import { Listener } from "../services/TrackerListener";
import { CacheManager } from "./cacheManager";

export const connectToAccount = async (accountId: string, groupId: string) => {
  try {
    console.log(
      `Connecting to account: ${accountId}${
        groupId ? ` in group ${groupId}` : ""
      }`
    );

    const account = await api.metatraderAccountApi.getAccount(accountId);
    const initialState = account.state;
    const deployedStates = ["DEPLOYING", "DEPLOYED"];

    if (!deployedStates.includes(initialState)) {
      console.log(`Deploying account: ${accountId}`);
      await account.deploy();
    }

    console.log(
      `Waiting for API server to connect to broker for account: ${accountId}`
    );
    await account.waitConnected();

    let connection = account.getStreamingConnection();
    await connection.connect();

    let riskManagementApi = riskManagement.riskManagementApi;
    if (!account.riskManagementApiEnabled) {
      console.log(`Risk management is not enabled for account ${accountId}`);
    }
    const group = CacheManager.getInstance().getGroup(groupId);
    if (!group) {
      console.error(
        `Group ${groupId} not found in cache, ignoring tracker creation`
      );
    }

    // First check if there's already a tracker in our local array
    let trackerExists = trackers.find((t) => t.accountId === accountId);

    if (!trackerExists) {
      try {
        // Try to fetch existing trackers from the API
        const existingTrackers = await riskManagementApi.getTrackers(accountId);
        const existingTracker = existingTrackers.find(
          (t) => t.name === "Risk Management Tracker"
        );

        if (existingTracker) {
          console.log(
            `Found existing tracker for account ${accountId}`,
            existingTracker
          );
          trackers.push({
            groupId,
            accountId,
            tracker: existingTracker,
          });
        } else {
          // Create new tracker only if one doesn't exist
          let tracker = await riskManagementApi.createTracker(accountId, {
            name: "Risk Management Tracker",
            period: "day",
            relativeDrawdownThreshold: group?.freezeThreshold || 1,
          });
          console.log("Tracker created", tracker);
          trackers.push({
            groupId,
            accountId,
            tracker,
          });
        }
      } catch (error) {
        console.error(
          `Error managing tracker for account ${accountId}:`,
          error
        );
        // If we get an error that suggests the tracker already exists, try to retrieve it
        try {
          const existingTrackers = await riskManagementApi.getTrackers(
            accountId
          );
          const existingTracker = existingTrackers.find(
            (t) => t.name === "Risk Management Tracker"
          );
          if (existingTracker) {
            console.log(
              `Retrieved existing tracker for account ${accountId}`,
              existingTracker
            );
            trackers.push({
              groupId,
              accountId,
              tracker: existingTracker,
            });
          }
        } catch (secondError) {
          console.error(
            `Failed to retrieve trackers for account ${accountId}:`,
            secondError
          );
        }
      }
    }

    // Add the synchronization listener to track real-time events
    const listener = new OrderSyncListener(groupId, accountId);
    connection.addSynchronizationListener(listener as any);

    const trackerListener = new Listener(groupId, accountId);

    riskManagementApi.addTrackerEventListener(trackerListener);

    console.log(
      `Waiting for SDK to synchronize terminal state for account: ${accountId}`
    );
    await connection.waitSynchronized();

    activeConnections.push({
      groupId,
      accountId,
      account,
      connection,
      listener,
      initialState,
    });

    console.log(
      `Account ${accountId} in group ${groupId} connected and synchronized`
    );

    return {
      groupId,
      accountId,
      account,
      connection,
      listener,
      initialState,
    };
  } catch (err) {
    console.error(`Error connecting to account ${accountId}:`, err);
    return undefined;
  }
};

// Function to disconnect from an account
export const disconnectFromAccount = async (accountId: string) => {
  const connectionIndex = activeConnections.findIndex(
    (conn) => conn.accountId === accountId
  );

  if (connectionIndex === -1) {
    console.log(`Account ${accountId} not found in active connections`);
    return false;
  }

  const { groupId, account, connection, listener, initialState } =
    activeConnections[connectionIndex];

  try {
    // Remove listener before closing
    connection.removeSynchronizationListener(listener);

    // Close the connection
    await connection.close();

    const deployedStates = ["DEPLOYING", "DEPLOYED"];
    if (!deployedStates.includes(initialState)) {
      // Undeploy account if it was undeployed initially
      console.log(`Undeploying account: ${accountId}`);
      await account.undeploy();
    }

    // Clean up risk management data
    // await cleanupFrozenAccount(groupId, accountId);

    // Remove from active connections
    activeConnections.splice(connectionIndex, 1);

    console.log(`Account ${accountId} from group ${groupId} disconnected`);

    // Notify all connected clients
    // wsConnections.forEach((ws) => {
    //   ws.send(
    //     JSON.stringify({
    //       event: "accountDisconnected",
    //       groupId,
    //       accountId,
    //     })
    //   );
    // });

    return true;
  } catch (err) {
    console.error(`Error disconnecting from account ${accountId}:`, err);
    return false;
  }
};
