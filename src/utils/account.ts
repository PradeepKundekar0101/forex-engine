import { activeConnections, api } from "../constants/global";
import { OrderSyncListener } from "../services/OrderSyncListener";
// import { cleanupFrozenAccount } from "./riskmanagement";

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

    // Connect to MetaApi API
    let connection = account.getStreamingConnection();
    await connection.connect();

    // Add the synchronization listener to track real-time events
    const listener = new OrderSyncListener(groupId, accountId);
    connection.addSynchronizationListener(listener as any);

    // Wait until terminal state synchronized to the local state
    console.log(
      `Waiting for SDK to synchronize terminal state for account: ${accountId}`
    );
    await connection.waitSynchronized();

    // Store connection information
    activeConnections.push({
      groupId,
      accountId,
      account,
      connection,
      listener,
      initialState,
    });

    // Log account is connected and synchronized
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
