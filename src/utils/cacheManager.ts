import Group from "../models/group";
import GroupParticipant from "../models/groupParticipant";
import Freeze from "../models/frozenAccount";
import User from "../models/user";
import { activeConnections } from "../constants/global";
import { connectToAccount } from "../utils/account";
import { freezeAccount } from "./riskmanagement";
import { logger } from "./logger";

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
  initialBalance: number | undefined;
  freezeThreshold: number | undefined;
  freezeDuration: number | undefined;
  trackerId: string;
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
          let connection:
            | {
                groupId: string;
                accountId: string;
                account: any;
                connection: any;
                listener: any;
              }
            | undefined = undefined;
          connection = activeConnections.find(
            (conn) => conn.accountId === accountId && conn.groupId === groupId
          );

          if (!connection) {
            connection = await connectToAccount(accountId, groupId);
            if (!connection) {
              logger.error(
                `Failed to connect to account ${accountId} in group ${groupId}`
              );
              logger.info(
                `Removing participant ${accountId} in group ${groupId}`
              );
              this.removeParticipant(accountId);
              return;
            }
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
            initialBalance: participant.initialBalance || undefined,
            freezeThreshold: participant.freezeThreshold || undefined,
            freezeDuration: participant.freezeDuration || undefined,
            trackerId: participant.trackerId || "",
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
                logger.error(
                  `Failed to connect to account ${accountId} in group ${groupId}`
                );
                logger.info(
                  `Removing participant ${accountId} in group ${groupId}`
                );
                this.removeParticipant(accountId);
                return;
              }
            }

            const terminalState = connection.connection.terminalState;
            const group = this.groups.get(groupId);
            if (terminalState) {
              const accountInfo = terminalState.accountInformation;
              if (accountInfo) {
                participant.balance =
                  connection.connection.terminalState.accountInformation.balance;
                participant.equity =
                  connection.connection.terminalState.accountInformation.equity;
                const newPnlPercentage =
                  ((participant.equity - (participant.initialBalance || 0)) /
                    (participant.initialBalance || 0)) *
                  100;
                participant.pnlPercentage = parseFloat(
                  newPnlPercentage.toFixed(2)
                );
                participant.currentPnlPercentage = parseFloat(
                  newPnlPercentage.toFixed(2)
                );
                participant.profitLoss =
                  participant.equity - (participant.initialBalance || 0);
                participant.positions = terminalState.positions || [];
                participant.orders = terminalState.orders || [];
                participant.tradeCount = participant.deals
                  ? participant.deals.length
                  : 0;
              }

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

  public async removeParticipant(accountId: string): Promise<void> {
    try {
      this.groups.forEach((group) => {
        const participantIndex = group.participants.findIndex(
          (p) => p.accountId === accountId
        );
        if (participantIndex !== -1) {
          group.participants.splice(participantIndex, 1);
        }
      });

      await GroupParticipant.updateMany(
        { accountId },
        { $set: { status: "removed" } }
      );
    } catch (error) {
      console.error(`Error removing participant ${accountId}:`, error);
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

  public getFrozenAccounts(): Record<string, Record<string, any>> {
    return this.frozenAccounts;
  }
}

export const cacheManager = CacheManager.getInstance();
