import { activeConnections, api } from "../constants/global";
import Mt5Connection from "../models/mt5Connections";
import { OrderSyncListener } from "../services/OrderSyncListener";
import { CacheManager } from "./cacheManager";
import axios from "axios";
import { logger } from "./logger";
export const connectToAccount = async (accountId: string, groupId: string) => {
  try {
    console.log(
      `Connecting to account: ${accountId}${
        groupId ? ` in group ${groupId}` : ""
      }`
    );
    const response = await axios.get(
      `${process.env.METAAPI_URL}/users/current/accounts/${accountId}/account-information`,
      {
        headers: {
          "auth-token": process.env.METAAPI_TOKEN as string,
        },
      }
    );
    logger.info("api response", response);
    if (response.status === 404) {
      return undefined;
    }

    const account = await api.metatraderAccountApi.getAccount(accountId);
    const initialState = account.state;
    const deployedStates = ["DEPLOYING", "DEPLOYED"];
    if (initialState == "UNDEPLOYED") {
      await account.remove();
      await Mt5Connection.deleteOne({ accountId });
      activeConnections.splice(
        activeConnections.findIndex((conn) => conn.accountId === accountId),
        1
      );
      console.log(`Account ${accountId} removed from MetaTrader`);
      return;
    }
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

    if (!account.riskManagementApiEnabled) {
      console.log(`Risk management is not enabled for account ${accountId}`);
    }
    const group = CacheManager.getInstance().getGroup(groupId);
    if (!group) {
      console.error(
        `Group ${groupId} not found in cache, ignoring tracker creation`
      );
    }

    const listener = new OrderSyncListener(groupId, accountId);
    connection.addSynchronizationListener(listener as any);

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
