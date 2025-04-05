export interface FrozenAccount {
  accountId: string;
  frozenAt: Date;
  initialEquity: number;
  releaseTimeout: NodeJS.Timeout;
  reason: string;
}
