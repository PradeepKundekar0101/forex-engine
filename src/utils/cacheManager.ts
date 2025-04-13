import Group from "../models/group";
import GroupParticipant from "../models/groupParticipant";
import Freeze from "../models/frozenAccount";
import User from "../models/user";

import { activeConnections } from "../constants/global";
import { connectToAccount } from "../utils/account";
import Deal from "../models/deal";
import { freezeAccount } from "./riskmanagement";

export interface ParticipantData {
  userId: string;
  accountId: string;
  name: string;
  groupId: string;
  freezeCount: number;
  pnlPercentage: number;
  currentPnlPercentage: number;
  tradeCount: number;
  deals: any[];
  positions: any[];
  orders: any[];
  balance: number;
  equity: number;
  profitLoss: number;
  firstName: string;
  lastName: string;
  email: string;
  phonenumber: string;
  groupParticipantId: string;
}

export interface GroupData {
  _id: string;
  name: string;
  description: string;
  participants: ParticipantData[];
  freezeThreshold: number;
  freezeDuration: number;
  initialBalance: number;
  createdAt: Date;
}

export class CacheManager {
  private static instance: CacheManager;
  private groups: Map<string, GroupData> = new Map();
  private participants: Map<string, ParticipantData> = new Map();
  private pendingDeals: Map<string, any[]> = new Map();
  private frozenAccounts: Record<string, Record<string, any>> = {};
  private refreshInterval: NodeJS.Timeout | null = null;
  private tradingDataRefreshInterval: NodeJS.Timeout | null = null;
  private lastRefresh: number = 0;
  private lastTradingDataRefresh: number = 0;
  private refreshInProgress: boolean = false;
  private tradingDataRefreshInProgress: boolean = false;
  private refreshIntervalMs: number = 30000;
  private tradingDataRefreshIntervalMs: number = 2000;

  private constructor() {}

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  public init(
    refreshIntervalMs: number = 30000,
    tradingDataRefreshIntervalMs: number = 2000
  ): void {
    this.refreshIntervalMs = refreshIntervalMs;
    this.tradingDataRefreshIntervalMs = tradingDataRefreshIntervalMs;

    this.refreshCache();

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    if (this.tradingDataRefreshInterval) {
      clearInterval(this.tradingDataRefreshInterval);
    }

    this.refreshInterval = setInterval(() => {
      this.refreshCache();
    }, this.refreshIntervalMs);

    this.tradingDataRefreshInterval = setInterval(() => {
      this.refreshTradingData();
    }, this.tradingDataRefreshIntervalMs);

    console.log(
      `Cache manager initialized with ${refreshIntervalMs}ms DB refresh interval and ${tradingDataRefreshIntervalMs}ms trading data refresh interval`
    );
  }

  public stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    if (this.tradingDataRefreshInterval) {
      clearInterval(this.tradingDataRefreshInterval);
      this.tradingDataRefreshInterval = null;
    }

    console.log("Cache manager stopped");
  }

  public async refreshCache(): Promise<void> {
    if (this.refreshInProgress) {
      return;
    }
    try {
      this.refreshInProgress = true;
      console.log("Refreshing DB cache...");
      const groups = await Group.find();
      const newGroups: Map<string, GroupData> = new Map();
      const newParticipants: Map<string, ParticipantData> = new Map();
      const newFrozenAccounts: Record<string, Record<string, any>> = {};

      for (const group of groups) {
        const groupId = group._id.toString();

        if (!newFrozenAccounts[groupId]) {
          newFrozenAccounts[groupId] = {};
        }

        const participants = await GroupParticipant.find({
          groupId: group._id,
          status: "approved",
        });
        const participantsWithGroupAndUser = await GroupParticipant.populate(
          participants,
          [{ path: "groupId" }, { path: "userId", model: "User" }]
        );

        const participantData: ParticipantData[] = [];

        for (const participant of participantsWithGroupAndUser) {
          const userId = participant.userId
            ? typeof participant.userId === "object"
              ? participant.userId._id.toString()
              : String(participant.userId)
            : "";

          let userData = null;
          try {
            if (userId) {
              userData = await User.findById(userId);
            }
          } catch (error) {
            console.error(`Error fetching user data for ID ${userId}:`, error);
          }

          const accountId = participant.accountId;
          let connection = activeConnections.find(
            (conn) => conn.accountId === accountId && conn.groupId === groupId
          );

          if (!connection) {
            connection = await connectToAccount(accountId, groupId);
          }

          const freezeHistory = await Freeze.find({
            accountId,
            groupId,
          });
          const freezeCount = freezeHistory.length;

          if (freezeHistory.length > 0) {
            const latestFreeze = freezeHistory[freezeHistory.length - 1];
            newFrozenAccounts[groupId][accountId] = latestFreeze;
          }

          const existingParticipant = this.participants.get(accountId);

          const balance =
            connection?.connection.terminalState.accountInformation?.balance ||
            0;
          const equity =
            connection?.connection.terminalState.accountInformation?.equity ||
            0;
          const initialBalance = group.initialBalance || 0;
          const pnlPercentage =
            initialBalance > 0
              ? ((equity - initialBalance) / initialBalance) * 100
              : 0;
          const currentPnlPercentage =
            balance > 0 ? ((equity - balance) / balance) * 100 : 0;
          const name = connection?.account.name || `User ${accountId}`;

          const data: ParticipantData = {
            userId: userData ? userData._id.toString() : "",
            accountId,
            name,
            groupId,
            freezeCount,
            pnlPercentage: parseFloat(pnlPercentage.toFixed(2)),
            currentPnlPercentage: parseFloat(currentPnlPercentage.toFixed(2)),
            tradeCount: existingParticipant?.tradeCount || 0,
            deals: [],
            positions:
              existingParticipant?.positions ||
              connection?.connection.terminalState.positions ||
              [],
            orders:
              existingParticipant?.orders ||
              connection?.connection.terminalState.orders ||
              [],
            balance,
            equity,
            profitLoss: equity - initialBalance,
            firstName: userData?.firstName || "",
            lastName: userData?.lastName || "",
            email: userData?.email || "",
            phonenumber: userData?.phoneNumber || "",
            groupParticipantId: participant._id.toString(),
          };

          participantData.push(data);
          newParticipants.set(accountId, data);
        }

        newGroups.set(groupId, {
          _id: groupId,
          name: group.name,
          description: group.description,
          participants: participantData,
          freezeThreshold: group.freezeThreshold,
          freezeDuration: group.freezeDuration,
          initialBalance: group.initialBalance || 0,
          createdAt: group.createdAt,
        });
      }

      this.groups = newGroups;
      this.participants = newParticipants;
      this.frozenAccounts = newFrozenAccounts;
      this.lastRefresh = Date.now();

      console.log(
        `DB cache refreshed with ${this.groups.size} groups and ${this.participants.size} participants`
      );

      await this.processPendingDeals();
    } catch (error) {
      console.error("Error refreshing DB cache:", error);
    } finally {
      this.refreshInProgress = false;
    }
  }

  public async refreshTradingData(): Promise<void> {
    if (this.tradingDataRefreshInProgress) {
      return;
    }

    try {
      this.tradingDataRefreshInProgress = true;

      const updatePromises = Array.from(this.participants.entries()).map(
        async ([accountId, participant]) => {
          const { groupId } = participant;

          try {
            let connection = activeConnections.find(
              (conn) => conn.accountId === accountId && conn.groupId === groupId
            );

            if (!connection) {
              connection = await connectToAccount(accountId, groupId);
              if (!connection) {
                // Use delete method instead of filter since participants is a Map
                this.participants.delete(accountId);
                console.error(
                  `Failed to connect to account ${accountId} in group ${groupId}`
                );
                return;
              }
            }

            const terminalState = connection.connection.terminalState;
            const group = this.groups.get(groupId);
            if (terminalState) {
              const accountInfo = terminalState.accountInformation;
              if (accountInfo) {
                const balance = accountInfo.balance || 0;
                const equity = accountInfo.equity || 0;
                const initialBalance = group ? group.initialBalance || 0 : 0;
                const pnlPercentage =
                  initialBalance > 0
                    ? ((equity - initialBalance) / initialBalance) * 100
                    : 0;
                const currentPnlPercentage =
                  balance > 0 ? ((equity - balance) / balance) * 100 : 0;

                participant.balance = balance;
                participant.equity = equity;
                participant.pnlPercentage = parseFloat(
                  pnlPercentage.toFixed(2)
                );
                participant.currentPnlPercentage = parseFloat(
                  currentPnlPercentage.toFixed(2)
                );

                participant.profitLoss = equity - initialBalance;

                if (
                  group &&
                  group.createdAt > new Date("2025-04-12T10:00:00Z") &&
                  currentPnlPercentage < 0 &&
                  Math.abs(currentPnlPercentage) >= group?.freezeThreshold
                ) {
                  console.log("currentPnlPercentage", currentPnlPercentage);
                  console.log("group?.freezeThreshold", group?.freezeThreshold);
                  console.log("Freezing account", accountId);
                  await freezeAccount(groupId, accountId, "Drawdown", true);
                }
              }

              participant.positions = terminalState.positions || [];
              participant.orders = terminalState.orders || [];
              participant.tradeCount = participant.deals
                ? participant.deals.length
                : 0;

              if (group) {
                const participantIndex = group.participants.findIndex(
                  (p) => p.accountId === accountId
                );
                if (participantIndex !== -1) {
                  group.participants[participantIndex] = participant;
                }
              }
            }
          } catch (error) {
            console.error(
              `Error updating trading data for account ${accountId}:`,
              error
            );
          }
        }
      );

      await Promise.all(updatePromises);

      this.lastTradingDataRefresh = Date.now();
    } catch (error) {
      console.error("Error refreshing trading data:", error);
    } finally {
      this.tradingDataRefreshInProgress = false;
    }
  }

  public getGroups(): GroupData[] {
    return Array.from(this.groups.values());
  }

  public getGroup(groupId: string): GroupData | undefined {
    return this.groups.get(groupId);
  }

  public getGroupParticipants(groupId: string): ParticipantData[] {
    const group = this.groups.get(groupId);
    return group?.participants || [];
  }

  public getParticipant(accountId: string): ParticipantData | undefined {
    return this.participants.get(accountId);
  }

  public async addDeal(
    accountId: string,
    deal: any,
    queueIfMissing: boolean = true
  ): Promise<void> {
    try {
      const participant = this.participants.get(accountId);

      if (!participant && queueIfMissing) {
        console.log(
          `Account ${accountId} not found in cache, queueing deal for later processing`
        );
        if (!this.pendingDeals.has(accountId)) {
          this.pendingDeals.set(accountId, []);
        }
        this.pendingDeals.get(accountId)?.push(deal);
        return;
      }

      if (participant && participant.groupId) {
        const group = this.groups.get(participant.groupId);
        if (group) {
          const participantIndex = group.participants.findIndex(
            (p) => p.accountId === accountId
          );
          if (participantIndex !== -1) {
            const newDeal = {
              accountId,
              dealId: deal.id,
              ...deal,
            };
            console.log("Updating deal", newDeal);

            const existingDealInCache = group.participants[
              participantIndex
            ].deals.find((d) => d.dealId === deal.id);

            if (!existingDealInCache) {
              group.participants[participantIndex].deals.push(deal);
              group.participants[participantIndex].tradeCount =
                group.participants[participantIndex].deals.length;
            }
          }
        }
      }
    } catch (error: any) {
      if (error.code !== 11000) {
        console.error(`Error adding deal for account ${accountId}:`, error);
      }
    }
  }

  public setPositions(accountId: string, positions: any[]): void {
    const participant = this.participants.get(accountId);
    if (participant) {
      participant.positions = positions;

      if (participant.groupId) {
        const group = this.groups.get(participant.groupId);
        if (group) {
          const participantIndex = group.participants.findIndex(
            (p) => p.accountId === accountId
          );
          if (participantIndex !== -1) {
            group.participants[participantIndex].positions = positions;
          }
        }
      }
    }
  }

  public setOrders(accountId: string, orders: any[]): void {
    const participant = this.participants.get(accountId);
    if (participant) {
      participant.orders = orders;

      if (participant.groupId) {
        const group = this.groups.get(participant.groupId);
        if (group) {
          const participantIndex = group.participants.findIndex(
            (p) => p.accountId === accountId
          );
          if (participantIndex !== -1) {
            group.participants[participantIndex].orders = orders;
          }
        }
      }
    }
  }

  public getLeaderboard(groupId: string): any[] {
    const currentParticipants = this.getGroupParticipants(groupId);
    if (!currentParticipants.length) {
      return [];
    }
    const sortedParticipants = [...currentParticipants].sort(
      (a, b) => b.pnlPercentage - a.pnlPercentage
    );
    const group = this.getGroup(groupId);

    return sortedParticipants.map((participant, index) => {
      let freezeDetails =
        this.frozenAccounts[groupId]?.[participant.accountId] || {};

      if (freezeDetails && typeof freezeDetails.toObject === "function") {
        freezeDetails = freezeDetails.toObject();
      } else if (freezeDetails && freezeDetails._doc) {
        freezeDetails = freezeDetails._doc;
      } else if (freezeDetails) {
        freezeDetails = { ...freezeDetails };
      }

      if (freezeDetails) {
        delete freezeDetails._releaseTimeout;
      }

      return {
        accountId: participant.accountId,
        name: participant.name,
        pnlPercentage: participant.pnlPercentage,
        totalFreezesCount: participant.freezeCount,
        totalTrades: participant.deals.length,
        groupName: group?.name || "",
        groupId,
        rank: index + 1,
        profitLoss: participant.profitLoss,
        balance: participant.balance,
        equity: participant.equity,
        userName: participant.firstName + " " + participant.lastName,
        email: participant.email,
        phoneNumber: participant.phonenumber,
        userId: participant.userId,
        freezeDetails,
        groupParticipantId: participant.groupParticipantId,
      };
    });
  }

  public getLastRefreshTime(): number {
    return this.lastRefresh;
  }

  public getLastTradingDataRefreshTime(): number {
    return this.lastTradingDataRefresh;
  }

  public getUser(userId: string): ParticipantData | undefined {
    for (const group of this.groups.values()) {
      for (const participant of group.participants) {
        if (participant.userId === userId) {
          return participant;
        }
      }
    }
    return undefined;
  }

  private async processPendingDeals(): Promise<void> {
    for (const [accountId, deals] of this.pendingDeals.entries()) {
      console.log(
        `Processing ${deals.length} pending deals for account ${accountId}`
      );
      for (const deal of deals) {
        await this.addDeal(accountId, deal, false);
      }
    }
    this.pendingDeals.clear();
  }

  public getFrozenAccounts(): Record<string, Record<string, any>> {
    return this.frozenAccounts;
  }

  // Add a method to force refresh data for a specific account
  public async forceRefreshAccountData(
    groupId: string,
    accountId: string
  ): Promise<boolean> {
    try {
      let connection = activeConnections.find(
        (conn) => conn.accountId === accountId && conn.groupId === groupId
      );

      if (!connection) {
        console.log(`Force reconnecting to account ${accountId}`);
        const { connectToAccount } = require("./account");
        connection = await connectToAccount(accountId, groupId);
        if (!connection) {
          console.error(
            `Failed to connect to account ${accountId} in group ${groupId}`
          );
          return false;
        }
      } else if (connection.connection.status !== "connected") {
        console.log(
          `Force reconnecting existing connection for account ${accountId}`
        );
        try {
          await connection.connection.connect();
          await connection.connection.waitSynchronized();
        } catch (reconnectError) {
          console.error(
            `Error reconnecting existing connection for account ${accountId}:`,
            reconnectError
          );
          return false;
        }
      }

      const participant = this.getParticipant(accountId);
      if (!participant) {
        console.error(`Participant ${accountId} not found in cache`);
        return false;
      }

      // Get the latest trading data from the connection
      const terminalState = connection.connection.terminalState;
      if (terminalState && terminalState.accountInformation) {
        const accountInfo = terminalState.accountInformation;
        const balance = accountInfo.balance || 0;
        const equity = accountInfo.equity || 0;
        const group = this.getGroup(groupId);
        const initialBalance = group ? group.initialBalance || 0 : 0;
        const pnlPercentage =
          initialBalance > 0
            ? ((equity - initialBalance) / initialBalance) * 100
            : 0;
        const currentPnlPercentage =
          balance > 0 ? ((equity - balance) / balance) * 100 : 0;

        // Update participant in the participants map
        participant.balance = balance;
        participant.equity = equity;
        participant.pnlPercentage = parseFloat(pnlPercentage.toFixed(2));
        participant.currentPnlPercentage = parseFloat(
          currentPnlPercentage.toFixed(2)
        );
        participant.profitLoss = equity - initialBalance;
        participant.positions = terminalState.positions || [];
        participant.orders = terminalState.orders || [];

        // Also update the participant in the group's participants array
        const groupData = this.getGroup(groupId);
        if (groupData) {
          const participantIndex = groupData.participants.findIndex(
            (p) => p.accountId === accountId
          );
          if (participantIndex !== -1) {
            // Deep copy all the updated values
            groupData.participants[participantIndex].balance = balance;
            groupData.participants[participantIndex].equity = equity;
            groupData.participants[participantIndex].pnlPercentage = parseFloat(
              pnlPercentage.toFixed(2)
            );
            groupData.participants[participantIndex].currentPnlPercentage =
              parseFloat(currentPnlPercentage.toFixed(2));
            groupData.participants[participantIndex].profitLoss =
              equity - initialBalance;
            groupData.participants[participantIndex].positions =
              terminalState.positions || [];
            groupData.participants[participantIndex].orders =
              terminalState.orders || [];
          }
        }

        console.log(
          `Force refreshed trading data for account ${accountId} in group ${groupId}`
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error(
        `Error force refreshing data for account ${accountId}:`,
        error
      );
      return false;
    }
  }
}

export const cacheManager = CacheManager.getInstance();
