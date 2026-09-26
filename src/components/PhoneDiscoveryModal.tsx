import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Smartphone,
  ShieldCheck,
  KeyRound,
  Search,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Landmark,
  Umbrella,
  PiggyBank,
  TrendingUp,
  ArrowRight,
  Loader2,
  ExternalLink,
  MapPin,
  User,
  Phone,
} from 'lucide-react';
import { SetuAAService, type SetuDiscoveredAccount } from '../services/setuAA';
import { Button, Chip } from './ui';

type Step = 'input' | 'setu_consent' | 'otp_verify' | 'scanning' | 'results';

interface PhoneDiscoveryModalProps {
  open: boolean;
  onClose: () => void;
  onImport?: (accounts: SetuDiscoveredAccount[]) => void;
  caseId?: string;
}

const BANK_ICONS: Record<string, React.ReactElement> = {
  SAVINGS: <Landmark className="size-5" />,
  CURRENT: <Building2 className="size-5" />,
  TERM_DEPOSIT: <PiggyBank className="size-5" />,
  MUTUAL_FUND: <TrendingUp className="size-5" />,
  INSURANCE: <Umbrella className="size-5" />,
  EPF: <ShieldCheck className="size-5" />,
};

const BANK_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  SAVINGS: { bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-100' },
  CURRENT: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-100' },
  TERM_DEPOSIT: { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-100' },
  MUTUAL_FUND: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100' },
  INSURANCE: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-100' },
  EPF: { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-100' },
};

const SCAN_NETWORKS = [
  { name: 'State Bank of India', delay: 600 },
  { name: 'HDFC Bank', delay: 900 },
  { name: 'ICICI Bank Network', delay: 1200 },
  { name: 'LIC of India', delay: 1600 },
  { name: 'EPFO Central Records', delay: 2000 },
  { name: 'National Securities Depository', delay: 2400 },
  { name: 'CAMS / KFintech', delay: 2800 },
];

export const PhoneDiscoveryModal: React.FC<PhoneDiscoveryModalProps> = ({
  open,
  onClose,
  onImport,
  caseId,
}) => {
  const [step, setStep] = useState<Step>('input');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [consentId, setConsentId] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [scanningNetwork, setScanningNetwork] = useState('');
  const [scannedNetworks, setScannedNetworks] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<SetuDiscoveredAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const setu = SetuAAService.getInstance();

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('input');
      setPhone('');
      setPhoneError('');
      setOtp(['', '', '', '', '', '']);
      setOtpError('');
      setConsentId('');
      setScanProgress(0);
      setScanningNetwork('');
      setScannedNetworks([]);
      setAccounts([]);
      setSelectedAccounts(new Set());
      setImporting(false);
    }
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const validatePhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 10) return 'Enter a valid 10-digit Indian mobile number';
    if (digits.length > 10) return 'Phone number cannot exceed 10 digits';
    if (!/^[6-9]/.test(digits)) return 'Indian mobile numbers start with 6, 7, 8, or 9';
    return '';
  };

  const handlePhoneSubmit = async () => {
    const digits = phone.replace(/\D/g, '');
    const error = validatePhone(digits);
    if (error) {
      setPhoneError(error);
      return;
    }
    setPhoneError('');
    setStep('setu_consent');

    try {
      const response = await setu.createConsentRequest(`+91${digits}`);
      setConsentId(response.consentId);
    } catch {
      setPhoneError('Could not connect to Setu AA. Please try again.');
      setStep('input');
    }
  };

  const handleConsentApprove = () => {
    setStep('otp_verify');
    // Focus the first OTP input after render
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setOtpError('');

    // Auto-advance to next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
  };

  const handleOtpVerify = async () => {
    const code = otp.join('');
    if (code.length !== 6) {
      setOtpError('Please enter all 6 digits');
      return;
    }
    if (code !== '123456') {
      setOtpError('Invalid OTP. Sandbox code is 123456');
      return;
    }
    setOtpError('');
    setStep('scanning');
    await runScan();
  };

  const runScan = useCallback(async () => {
    setScanProgress(0);
    setScannedNetworks([]);

    for (let i = 0; i < SCAN_NETWORKS.length; i++) {
      const network = SCAN_NETWORKS[i];
      setScanningNetwork(network.name);
      await new Promise((r) => setTimeout(r, network.delay));
      setScannedNetworks((prev) => [...prev, network.name]);
      setScanProgress(Math.round(((i + 1) / SCAN_NETWORKS.length) * 100));
    }

    const digits = phone.replace(/\D/g, '');
    const discovered = await setu.fetchDiscoveredAccounts(`+91${digits}`);
    setAccounts(discovered);
    setSelectedAccounts(new Set(discovered.map((a) => a.accId)));
    setStep('results');
  }, [phone, setu]);

  const handleImportAll = async () => {
    setImporting(true);
    const selected = accounts.filter((a) => selectedAccounts.has(a.accId));
    // Small delay to feel intentional
    await new Promise((r) => setTimeout(r, 600));
    onImport?.(selected);
    setImporting(false);
    onClose();
  };

  const toggleAccount = (accId: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accId)) next.delete(accId);
      else next.add(accId);
      return next;
    });
  };

  if (!open) return null;

  const stepNumber = ['input', 'setu_consent', 'otp_verify', 'scanning', 'results'].indexOf(step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="RBI Account Aggregator — Bank Discovery"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 rounded-t-3xl bg-white/95 backdrop-blur-md border-b border-line px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <Smartphone className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-ink">RBI Account Aggregator</h2>
                <p className="text-xs text-soft">Powered by Setu AA • Sandbox Mode</p>
              </div>
            </div>
            <button
              className="focus-ring rounded-xl p-2 text-muted hover:bg-stone-100 transition-colors"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          {/* Step indicators */}
          <div className="mt-4 flex gap-1.5">
            {['Phone', 'Consent', 'OTP', 'Scan', 'Results'].map((label, i) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`h-1 w-full rounded-full transition-all duration-500 ${
                    i <= stepNumber ? 'bg-brand-600' : 'bg-stone-200'
                  }`}
                />
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    i <= stepNumber ? 'text-brand-700' : 'text-stone-400'
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {/* ── Step 1: Phone Input ── */}
          {step === 'input' && (
            <div className="space-y-5">
              <div className="rounded-2xl bg-brand-50/60 p-4 text-sm text-brand-900">
                <p className="font-medium">🔒 RBI-regulated discovery</p>
                <p className="mt-1 text-brand-800">
                  The Account Aggregator framework lets you discover all linked financial accounts
                  using just the registered mobile number — securely, with your explicit consent.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Registered mobile number
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sm font-medium text-muted">
                    <Phone className="size-4" />
                    +91
                  </span>
                  <input
                    id="setu-phone-input"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setPhone(digits);
                      if (phoneError) setPhoneError('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handlePhoneSubmit()}
                    className={`focus-ring h-12 w-full rounded-xl border bg-white pl-[5.5rem] pr-3 text-base font-mono tracking-wider text-ink placeholder:text-stone-400 transition-colors ${
                      phoneError ? 'border-red-300 ring-1 ring-red-200' : 'border-line'
                    }`}
                    autoFocus
                  />
                </div>
                {phoneError && (
                  <p className="mt-1.5 text-xs text-red-700 flex items-center gap-1">
                    <AlertTriangle className="size-3" />
                    {phoneError}
                  </p>
                )}
                <p className="mt-2 text-xs text-soft">
                  This is the mobile number registered with the deceased's bank accounts, insurance,
                  PF, and mutual funds.
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handlePhoneSubmit}
                disabled={phone.replace(/\D/g, '').length < 10}
                icon={<ArrowRight className="size-4" />}
              >
                Start RBI AA Discovery
              </Button>
            </div>
          )}

          {/* ── Step 2: Setu Consent ── */}
          {step === 'setu_consent' && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-50">
                  <ShieldCheck className="size-8 text-brand-700" />
                </div>
                <h3 className="mt-3 text-lg font-semibold text-ink">Consent Required</h3>
                <p className="mt-1 text-sm text-muted">
                  RBI Account Aggregator requires your explicit consent before accessing any
                  financial data.
                </p>
              </div>

              <div className="rounded-2xl bg-stone-50 ring-1 ring-line p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
                    1
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">Data Scope</p>
                    <p className="text-xs text-muted">
                      Account discovery across all RBI-regulated Financial Information Providers
                      (FIPs) — banks, insurance, PF, mutual funds.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
                    2
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">Purpose</p>
                    <p className="text-xs text-muted">
                      Estate asset discovery for succession planning and claim processing.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
                    3
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">Consent Validity</p>
                    <p className="text-xs text-muted">
                      One-time fetch. Data is not stored on Setu servers post-delivery.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-amber-700 mt-0.5" />
                  <p className="text-xs text-amber-900">
                    <span className="font-medium">Sandbox mode:</span> This uses Setu's sandbox
                    environment. No real financial data will be accessed.
                  </p>
                </div>
              </div>

              {consentId && (
                <p className="text-center text-xs text-soft font-mono truncate">
                  Consent ID: {consentId}
                </p>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setStep('input')}>
                  Go Back
                </Button>
                <Button className="flex-1" onClick={handleConsentApprove}>
                  Approve Consent
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: OTP Verify ── */}
          {step === 'otp_verify' && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-50">
                  <KeyRound className="size-8 text-brand-700" />
                </div>
                <h3 className="mt-3 text-lg font-semibold text-ink">Verify OTP</h3>
                <p className="mt-1 text-sm text-muted">
                  Enter the 6-digit OTP sent to{' '}
                  <span className="font-mono font-medium text-ink">
                    +91 {phone.slice(0, 2)}****{phone.slice(-4)}
                  </span>
                </p>
              </div>

              <div className="flex justify-center gap-2.5">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    className={`focus-ring size-12 rounded-xl border text-center text-lg font-mono font-semibold transition-all ${
                      digit
                        ? 'border-brand-500 bg-brand-50/50 text-brand-800 ring-1 ring-brand-200'
                        : otpError
                          ? 'border-red-300 bg-red-50/30'
                          : 'border-line bg-white text-ink'
                    }`}
                  />
                ))}
              </div>

              {otpError && (
                <p className="text-center text-xs text-red-700 flex items-center justify-center gap-1">
                  <AlertTriangle className="size-3" />
                  {otpError}
                </p>
              )}

              <div className="rounded-xl bg-stone-50 p-3 text-center">
                <p className="text-xs text-muted">
                  <span className="font-medium text-brand-800">Sandbox hint:</span> Use{' '}
                  <span className="font-mono font-semibold text-ink">123456</span> as the OTP
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleOtpVerify}
                disabled={otp.join('').length !== 6}
                icon={<ShieldCheck className="size-4" />}
              >
                Verify & Discover Accounts
              </Button>
            </div>
          )}

          {/* ── Step 4: Scanning Animation ── */}
          {step === 'scanning' && (
            <div className="space-y-6 py-4">
              <div className="text-center">
                <div className="relative mx-auto size-20">
                  {/* Outer rotating ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-brand-100 animate-[spin_3s_linear_infinite]" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand-600 animate-[spin_1.5s_linear_infinite]" />
                  <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-brand-400 animate-[spin_2s_linear_infinite_reverse]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Search className="size-7 text-brand-700 animate-pulse" />
                  </div>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">
                  Scanning Financial Networks
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Querying RBI-regulated institutions via Account Aggregator…
                </p>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted">Discovery progress</span>
                  <span className="text-brand-700">{scanProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-[width] duration-500 ease-out"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>

              {/* Network scan list */}
              <div className="space-y-1.5 rounded-2xl bg-stone-50 p-3">
                {SCAN_NETWORKS.map((network) => {
                  const done = scannedNetworks.includes(network.name);
                  const active = scanningNetwork === network.name && !done;
                  return (
                    <div
                      key={network.name}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-300 ${
                        done
                          ? 'bg-brand-50/80 text-brand-900'
                          : active
                            ? 'bg-white shadow-sm ring-1 ring-brand-100 text-ink'
                            : 'text-stone-400'
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="size-4 text-brand-600 shrink-0" />
                      ) : active ? (
                        <Loader2 className="size-4 text-brand-600 animate-spin shrink-0" />
                      ) : (
                        <div className="size-4 rounded-full border-2 border-stone-200 shrink-0" />
                      )}
                      <span className={active ? 'font-medium' : ''}>{network.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 5: Results ── */}
          {step === 'results' && (
            <div className="space-y-5">
              {/* Success header */}
              <div className="text-center rounded-2xl bg-gradient-to-b from-brand-50 to-white p-5 ring-1 ring-brand-100">
                <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-100">
                  <CheckCircle2 className="size-7 text-brand-700" />
                </div>
                <h3 className="mt-3 text-lg font-semibold text-ink">
                  {accounts.length} Accounts Discovered
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Across {new Set(accounts.map((a) => a.bankName)).size} financial institutions via
                  RBI Account Aggregator
                </p>
              </div>

              {/* Account cards */}
              <div className="space-y-2.5">
                {accounts.map((account) => {
                  const colors = BANK_COLORS[account.accountType] ?? BANK_COLORS.SAVINGS;
                  const selected = selectedAccounts.has(account.accId);
                  return (
                    <button
                      key={account.accId}
                      type="button"
                      onClick={() => toggleAccount(account.accId)}
                      className={`focus-ring w-full rounded-2xl p-4 text-left ring-1 transition-all duration-200 ${
                        selected
                          ? 'bg-white ring-brand-200 shadow-sm'
                          : 'bg-stone-50 ring-line opacity-60'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <span
                          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${colors.bg} ${colors.text}`}
                        >
                          {BANK_ICONS[account.accountType] ?? <Building2 className="size-5" />}
                        </span>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-ink leading-snug truncate">
                                {account.bankName}
                              </p>
                              <p className="text-xs text-muted font-mono mt-0.5">
                                {account.maskedAccNo}
                              </p>
                            </div>
                            {/* Checkbox */}
                            <div
                              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                                selected
                                  ? 'border-brand-600 bg-brand-600'
                                  : 'border-stone-300 bg-white'
                              }`}
                            >
                              {selected && <CheckCircle2 className="size-3.5 text-white" />}
                            </div>
                          </div>

                          {/* Balance + Type chip */}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="text-lg font-bold text-ink">{account.balance}</span>
                            <Chip
                              tone={
                                account.accountType === 'SAVINGS' || account.accountType === 'CURRENT'
                                  ? 'blue'
                                  : account.accountType === 'INSURANCE'
                                    ? 'amber'
                                    : account.accountType === 'EPF'
                                      ? 'brand'
                                      : 'green'
                              }
                            >
                              {account.accountType.replace(/_/g, ' ')}
                            </Chip>
                          </div>

                          {/* Nominee + Location */}
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-1.5 text-xs">
                              <User className="size-3 text-soft" />
                              {account.nomineeStatus === 'confirmed' ? (
                                <span className="text-green-800">
                                  ✓ {account.nomineeName}
                                </span>
                              ) : (
                                <span className="text-amber-800 font-medium">
                                  ⚠ No nominee registered
                                </span>
                              )}
                            </div>
                            <div className="flex items-start gap-1.5 text-xs text-muted">
                              <MapPin className="size-3 mt-0.5 shrink-0" />
                              <span>{account.suggestedLocation}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selection summary */}
              <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 ring-1 ring-line">
                <span className="text-sm text-muted">
                  {selectedAccounts.size} of {accounts.length} selected
                </span>
                <button
                  type="button"
                  className="text-sm font-medium text-brand-700 hover:text-brand-900 transition-colors"
                  onClick={() => {
                    if (selectedAccounts.size === accounts.length) {
                      setSelectedAccounts(new Set());
                    } else {
                      setSelectedAccounts(new Set(accounts.map((a) => a.accId)));
                    }
                  }}
                >
                  {selectedAccounts.size === accounts.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {/* Import button */}
              <Button
                className="w-full"
                onClick={handleImportAll}
                loading={importing}
                disabled={selectedAccounts.size === 0}
                icon={<ArrowRight className="size-4" />}
              >
                Import {selectedAccounts.size} Account{selectedAccounts.size !== 1 ? 's' : ''} to
                Case
              </Button>

              <p className="text-center text-[11px] text-soft leading-relaxed">
                Data fetched via Setu Account Aggregator (RBI AA framework).
                <br />
                No financial data is stored on our servers.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhoneDiscoveryModal;
