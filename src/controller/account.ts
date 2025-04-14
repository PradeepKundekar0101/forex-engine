import { Request, Response } from "express";
import { activeConnections, api } from "../constants/global";
import { OrderSyncListener } from "../services/OrderSyncListener";
import Mt5Connection from "../models/mt5Connections";
import { CacheManager, cacheManager } from "../utils/cacheManager";

export const connectAccount = async (req: Request, res: Response) => {
  const {
    login,
    server,
    password,
    name = `${login}@${server}`,
    groupId = "default",
    userId,
  } = req.body;
  if (!login || !server || !password) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  try {
    const existingConnectionInDb = await Mt5Connection.findOne({
      userId,
      login,
    });
    const existingConnection = activeConnections.find(
      (conn) => conn.account.login === login
    );
    const accounts =
      await api.metatraderAccountApi.getAccountsWithInfiniteScrollPagination();
    const accountId = accounts.find((account) => account.login === login)?.id;
    if (existingConnection && existingConnection.accountId === accountId) {
      if (!existingConnectionInDb) {
        await Mt5Connection.create({
          accountId,
          userId,
          login,
          server,
          password,
          name,
        });
      }
      res.status(200).json({ message: "Account already connected" });

      return;
    }
    if (!existingConnection && accountId) {
      const account = await api.metatraderAccountApi.getAccount(accountId);
      if (account) {
        const connection = account.getStreamingConnection();
        await connection.connect();
        await connection.waitSynchronized();
        const listener = new OrderSyncListener(groupId, accountId);
        activeConnections.push({
          accountId,
          account,
          groupId,
          connection: connection,
          listener: listener,
          initialState: account.state,
        });

        if (existingConnection) {
          res.status(200).json({
            message: "Account already connected",
            accountId,
            groupId,
          });
          if (!existingConnectionInDb) {
            await Mt5Connection.create({
              accountId,
              userId,
              login,
              server,
              password,
              name,
            });
          }
          return;
        }
      }
    }
    try {
      const newAccount = await api.metatraderAccountApi.createAccount({
        login,
        server,
        password,
        name: name || `${login}@${server}`,
        //@ts-ignore
        type: "cloud",
        platform: "mt5",
        magic: 1000,
        application: "MetaApi",
        riskManagementApiEnabled: true,
      });
      const accountId = newAccount.id;
      await Mt5Connection.create({
        accountId,
        userId,
        login,
        server,
        password,
        name,
      });
      console.log(`Created new account with id ${accountId}`);
      res.status(200).json({
        message: "Account created successfully",
        accountId,
        groupId,
      });
      return;
    } catch (err) {
      console.error("Error creating account:", err);
      res.status(500).json({ error: (err as any).message });
      return;
    }
  } catch (err) {
    console.error("Error adding account:", err);
    res.status(500).json({ error: (err as any).message });
  }
};

export const getAccountDetails = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const account = cacheManager.getUser(userId);
  res.status(200).json({ account });
};
export const disconnectAccount = async (req: Request, res: Response) => {
  const { accountId } = req.body;
  try {
    const account = await api.metatraderAccountApi.getAccount(accountId);
    console.log("Removing participant", account);
    if (account.id) {
      await account.getStreamingConnection().account.remove();
      await account.getStreamingConnection().account.undeploy();
    }
    CacheManager.getInstance().removeParticipant(accountId);
    res.status(200).json({ message: "Account disconnected" });
  } catch (error) {
    if (error instanceof Error && error.message.includes("NotFoundError")) {
      CacheManager.getInstance().removeParticipant(accountId);
      res.status(200).json({ message: "Account disconnected" });
    } else {
      console.error("Error disconnecting account:", error);
      res.status(500).json({ error: (error as any).message });
    }
  }
};
