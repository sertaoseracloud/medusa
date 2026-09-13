export interface SymbolRecord {
  symbol: string;
  base: string;
  quote: string;
  basePrecision: number;
  quotePrecision: number;
  minNotional: string | null;
  minLotSize: string | null;
  isFavorite: boolean;
  syncedAt: Date;
}
