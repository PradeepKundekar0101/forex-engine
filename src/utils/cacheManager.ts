import Group from "../models/group";
import GroupParticipant from "../models/groupParticipant";
import Freeze from "../models/frozenAccount";
import User from "../models/user";

import { activeConnections } from "../constants/global";
import { connectToAccount } from "../utils/account";
import Deal from "../models/deal";

export interface ParticipantData {
  userId: string;
  accountId: string;
  name: string;
  groupId: string;
  freezeCount: number;
  pnlPercentage: number;
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
}

export interface GroupData {
  _id: string;
  name: string;
  description: string;
  participants: ParticipantData[];
}

export class CacheManager {
  private static instance: CacheManager;
  private groups: Map<string, GroupData> = new Map();
  private participants: Map<string, ParticipantData> = new Map();
  private pendingDeals: Map<string, any[]> = new Map(); // Store deals that come in before participants are initialized
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

    // Initial full cache refresh
    this.refreshCache();

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    if (this.tradingDataRefreshInterval) {
      clearInterval(this.tradingDataRefreshInterval);
    }

    // Set up slow-changing data refresh interval
    this.refreshInterval = setInterval(() => {
      this.refreshCache();
    }, this.refreshIntervalMs);

    // Set up fast-changing trading data refresh interval
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

      for (const group of groups) {
        const groupId = group._id.toString();
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

          const deals = await Deal.find({
            accountId,
            groupId,
          });
          deals.map((deal) => {
            if (this.participants.get(accountId)) {
              const existingDealInCache = this.participants
                .get(accountId)
                ?.deals.find((d) => d.dealId === deal.dealId);
              if (!existingDealInCache) {
                this.participants.get(accountId)?.deals.push(deal);
              }
            }
          });
          const freezeHistory = await Freeze.find({
            accountId,
            groupId,
          });
          const freezeCount = freezeHistory.length;

          const existingParticipant = this.participants.get(accountId);

          const balance =
            connection?.connection.terminalState.accountInformation?.balance ||
            0;
          const equity =
            connection?.connection.terminalState.accountInformation?.equity ||
            0;
          const pnlPercentage =
            balance > 0 ? ((equity - balance) / balance) * 100 : 0;
          const name = connection?.account.name || `User ${accountId}`;

          const data: ParticipantData = {
            userId: userData ? userData._id.toString() : "",
            accountId,
            name,
            groupId,
            freezeCount,
            pnlPercentage: parseFloat(pnlPercentage.toFixed(2)),
            tradeCount: existingParticipant?.tradeCount || 0,
            deals: existingParticipant?.deals || [],
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
            profitLoss: pnlPercentage,
            firstName: userData ? userData.firstName || "" : "",
            lastName: userData ? userData.lastName || "" : "",
            email: userData ? userData.email || "" : "",
            phonenumber: userData ? userData.phoneNumber || "" : "",
          };

          participantData.push(data);
          newParticipants.set(accountId, data);
        }

        newGroups.set(groupId, {
          _id: groupId,
          name: group.name,
          description: group.description,
          participants: participantData,
        });
      }

      this.groups = newGroups;
      this.participants = newParticipants;
      this.lastRefresh = Date.now();

      console.log(
        `DB cache refreshed with ${this.groups.size} groups and ${this.participants.size} participants`
      );

      // Process any pending deals now that participants are loaded
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

      // Create an array of promises for each participant update
      const updatePromises = Array.from(this.participants.entries()).map(
        async ([accountId, participant]) => {
          const { groupId } = participant;

          try {
            let connection = activeConnections.find(
              (conn) => conn.accountId === accountId && conn.groupId === groupId
            );

            if (!connection) {
              // If connection doesn't exist, try to establish it
              connection = await connectToAccount(accountId, groupId);
              if (!connection) {
                console.error(
                  `Failed to connect to account ${accountId} in group ${groupId}`
                );
                return;
              }
            }

            // Update the trading data
            const terminalState = connection.connection.terminalState;
            if (terminalState) {
              // Update account information and trading data
              const accountInfo = terminalState.accountInformation;
              if (accountInfo) {
                const balance = accountInfo.balance || 0;
                const equity = accountInfo.equity || 0;
                const pnlPercentage =
                  balance > 0 ? ((equity - balance) / balance) * 100 : 0;

                participant.balance = balance;
                participant.equity = equity;
                participant.pnlPercentage = parseFloat(
                  pnlPercentage.toFixed(2)
                );
                participant.profitLoss = pnlPercentage;
              }

              // Update positions, orders, deals
              participant.positions = terminalState.positions || [];
              participant.orders = terminalState.orders || [];
              // Deals might be updated elsewhere, so we don't override them here if they exist

              // Update the trade count based on deals
              participant.tradeCount = participant.deals
                ? participant.deals.length
                : 0;

              // Update the corresponding group data
              const group = this.groups.get(groupId);
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

      // Wait for all updates to complete in parallel
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
      console.log("Adding deal---", deal);
      console.log("accountId---", accountId);

      const participant = this.participants.get(accountId);
      console.log("participant---", participant);

      // If participant not found and queueIfMissing is true, queue the deal for processing later
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

            // Only update cache if not already there
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
        // Not a duplicate key error
        console.error(`Error adding deal for account ${accountId}:`, error);
      }
    }
  }

  public setPositions(accountId: string, positions: any[]): void {
    const participant = this.participants.get(accountId);
    if (participant) {
      participant.positions = positions;

      // Update the corresponding group data
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

      // Update the corresponding group data
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
    const participants = this.getGroupParticipants(groupId);
    if (!participants.length) {
      return [];
    }
    const sortedParticipants = [...participants].sort(
      (a, b) => b.pnlPercentage - a.pnlPercentage
    );
    const group = this.getGroup(groupId);
    return sortedParticipants.map((participant, index) => ({
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
    }));
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

  /**
   * Process any deals that were received before participants were initialized
   */
  private async processPendingDeals(): Promise<void> {
    for (const [accountId, deals] of this.pendingDeals.entries()) {
      console.log(
        `Processing ${deals.length} pending deals for account ${accountId}`
      );
      for (const deal of deals) {
        await this.addDeal(accountId, deal, false); // Pass false to avoid re-queueing
      }
    }
    this.pendingDeals.clear();
  }
}

export const cacheManager = CacheManager.getInstance();
