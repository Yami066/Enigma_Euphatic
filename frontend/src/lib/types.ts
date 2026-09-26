export interface AssetRecord {
  assetId: string;
  caseId: string;
  institution: string;
  accountNumber: string;
  category: 'bank' | 'demat' | 'insurance' | 'pf' | 'real_estate' | 'other' | string;
  status: string;
  nomineeStatus: string;
  [key: string]: any;
}
