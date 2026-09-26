import type { AssetRecord } from '../lib/types';

export interface SetuConsentResponse {
  consentId: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED';
  redirectUrl: string;
}

export interface SetuDiscoveredAccount {
  accId: string;
  bankName: string;
  accountType: 'SAVINGS' | 'CURRENT' | 'TERM_DEPOSIT' | 'MUTUAL_FUND' | 'INSURANCE' | 'EPF';
  maskedAccNo: string;
  balance: string;
  nomineeStatus: 'confirmed' | 'unassigned';
  nomineeName?: string;
  suggestedLocation: string;
}

export class SetuAAService {
  private static instance: SetuAAService;
  private baseUrl = 'https://aa-sandbox.setu.co';
  private productInstanceId = 'c62412f5-7b4e-43eb-8457-668534a6908c';

  private constructor() {}

  public static getInstance(): SetuAAService {
    if (!SetuAAService.instance) {
      SetuAAService.instance = new SetuAAService();
    }
    return SetuAAService.instance;
  }

  public getSetuHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-product-instance-id': this.productInstanceId,
    };
  }

  public async createConsentRequest(phoneNumber: string): Promise<SetuConsentResponse> {
    const headers = this.getSetuHeaders();
    console.log('[Setu AA] Initiating consent with headers:', headers);

    // Sandbox simulation — in production this would POST to the Setu API
    await new Promise((r) => setTimeout(r, 1000));
    const mockConsentId = `setu-consent-${Date.now()}-${phoneNumber.slice(-4)}`;

    return {
      consentId: mockConsentId,
      status: 'PENDING',
      redirectUrl: `${this.baseUrl}/consent/${mockConsentId}?phone=${phoneNumber}`,
    };
  }

  public async fetchDiscoveredAccounts(phoneNumber: string): Promise<SetuDiscoveredAccount[]> {
    const headers = this.getSetuHeaders();
    console.log('[Setu AA] Querying accounts with Product Instance ID:', headers['x-product-instance-id']);

    // Sandbox simulation — in production this would GET from the Setu AA data-fetch endpoint
    await new Promise((r) => setTimeout(r, 1500));

    const last4 = phoneNumber.slice(-4) || '9876';
    const first4 = phoneNumber.slice(0, 4) || '9876';

    return [
      {
        accId: `setu-sbi-${last4}`,
        bankName: 'State Bank of India (SBI)',
        accountType: 'SAVINGS',
        maskedAccNo: `SBI-3098${first4}${last4}`,
        balance: `₹ ${(parseInt(last4) * 60 + 280000).toLocaleString('en-IN')}`,
        nomineeStatus: 'confirmed',
        nomineeName: 'Spouse (Confirmed on SBI YONO)',
        suggestedLocation: 'Master Bedroom Almirah, Green Passbook File',
      },
      {
        accId: `setu-hdfc-${last4}`,
        bankName: 'HDFC Bank',
        accountType: 'TERM_DEPOSIT',
        maskedAccNo: `HDFC-5010${last4}88`,
        balance: `₹ ${(parseInt(last4) * 40 + 350000).toLocaleString('en-IN')}`,
        nomineeStatus: 'confirmed',
        nomineeName: 'Spouse (Confirmed)',
        suggestedLocation: 'Study Desk Drawer, HDFC FD Certificate File',
      },
      {
        accId: `setu-lic-${last4}`,
        bankName: 'LIC of India',
        accountType: 'INSURANCE',
        maskedAccNo: `LIC-4471${last4}89`,
        balance: '₹ 10,00,000',
        nomineeStatus: 'confirmed',
        nomineeName: 'Spouse (Confirmed)',
        suggestedLocation: 'DigiLocker Verified Vault (Policy #4471XXXX89)',
      },
      {
        accId: `setu-epfo-${last4}`,
        bankName: 'EPFO (Employees Provident Fund)',
        accountType: 'EPF',
        maskedAccNo: `UAN-1009${first4}${last4}`,
        balance: `₹ ${(parseInt(last4) * 45 + 410000).toLocaleString('en-IN')}`,
        nomineeStatus: 'unassigned',
        suggestedLocation: 'Salary Slip / EPFO Member Portal',
      },
      {
        accId: `setu-icici-${last4}`,
        bankName: 'ICICI Prudential Mutual Fund',
        accountType: 'MUTUAL_FUND',
        maskedAccNo: `ICICI-FOLIO-${last4}`,
        balance: `₹ ${(parseInt(last4) * 30 + 190000).toLocaleString('en-IN')}`,
        nomineeStatus: 'confirmed',
        nomineeName: 'Son (Confirmed)',
        suggestedLocation: 'Email Portfolio Statement / CAMS Statement',
      },
    ];
  }

  /**
   * Convert a Setu discovered account into the project's AssetRecord shape
   * so it can be merged into an existing case.
   */
  public toAssetRecord(account: SetuDiscoveredAccount, caseId: string): AssetRecord {
    const categoryMap: Record<string, AssetRecord['category']> = {
      SAVINGS: 'bank',
      CURRENT: 'bank',
      TERM_DEPOSIT: 'bank',
      MUTUAL_FUND: 'demat',
      INSURANCE: 'insurance',
      EPF: 'pf',
    };
    return {
      assetId: account.accId,
      caseId,
      institution: account.bankName,
      accountNumber: account.maskedAccNo,
      category: categoryMap[account.accountType] ?? 'bank',
      status: 'DISCOVERED',
      nomineeStatus: account.nomineeStatus === 'confirmed' ? 'registered' : 'none',
    };
  }
}
