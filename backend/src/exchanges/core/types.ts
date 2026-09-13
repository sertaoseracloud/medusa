export interface DecryptedCredentials {
  accessKey: string;
  secretKey: string;
}

export interface NormalizedSymbol {
  symbol: string;
  base: string;
  quote: string;
  basePrecision: number;
  quotePrecision: number;
  minNotional: string | null;
  minLotSize: string | null;
}

export interface NormalizedBalance {
  asset: string;
  free: string;
  locked: string;
}
