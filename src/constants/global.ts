import MetaApi, { RiskManagement } from "metaapi.cloud-sdk";
import dotenv from "dotenv";
dotenv.config();

export const orderHistory: Record<string, Record<string, any>> = {};
export const FREEZE_DURATION_MS = 60 * 60 * 1000;
export const EQUITY_LOSS_THRESHOLD = 1000;
export const accountEquityHistory: Record<
  string,
  Record<
    string,
    {
      lastRecordedEquity: number;
      initialEquity: number;
      equityHighWatermark: number;
      currentProfitLossPercent: number;
    }
  >
> = {};
export const counterTradeTracking: Record<
  string,
  Record<string, Map<string, { timestamp: number; source: string }>>
> = {};
export const orderPositionMapping: Record<
  string,
  Record<string, Record<string, string>>
> = {};
export const globalCounterTradeTracking: Map<
  string,
  {
    timestamp: number;
    groupId: string;
    accountId: string;
    orderType: string;
    symbol: string;
    volume: number;
  }
> = new Map();
export const globallyProcessedItems = new Set<string>();
export const ENABLE_STRICTER_DEDUPLICATION = true;
export const accountProcessingLocks: Record<
  string,
  Record<string, boolean>
> = {};
export const accountProcessedItems: Record<
  string,
  Record<string, Set<string>>
> = {};
export const api = new MetaApi(process.env.METATRADER_API_KEY || "");
export const riskManagement = new RiskManagement(
  process.env.METATRADER_API_KEY || ""
);
export const activeConnections: {
  groupId: string;
  accountId: string;
  account: any;
  connection: any;
  listener: any;
  initialState: string;
  lastEquityCheck?: number;
}[] = [];
export const trackers: {
  groupId: string;
  accountId: string;
  tracker: any;
}[] = [];
export function getAccountKey(groupId: string, accountId: string): string {
  return `${groupId}:${accountId}`;
}
export function parseAccountKey(key: string): {
  groupId: string;
  accountId: string;
} {
  const [groupId, accountId] = key.split(":");
  return { groupId, accountId };
}
export function getProcessedItemKey(
  groupId: string,
  accountId: string,
  itemId: string
): string {
  return `${groupId}:${accountId}:${itemId}`;
}
