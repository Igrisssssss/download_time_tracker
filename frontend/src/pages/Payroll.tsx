import { useEffect, useMemo, useState } from 'react';
import { payrollApi } from '@/services/api';
import type { PayrollRecord, PayrollTransaction } from '@/types';
import { RefreshCw, Wallet } from 'lucide-react';

type OrgEmployee = { id: number; name: string; email: string; role: string };

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'paid':
    case 'success':
      return 'bg-green-100 text-green-700';
    case 'processed':
    case 'pending':
      return 'bg-amber-100 text-amber-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const money = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));

const defaultMonth = () => new Date().toISOString().slice(0, 7);

export default function Payroll() {
  const [employees, setEmployees] = useState<OrgEmployee[]>([]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [transactions, setTransactions] = useState<PayrollTransaction[]>([]);
  const [payrollMode, setPayrollMode] = useState<'mock' | 'stripe_test' | 'stripe_live'>('mock');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [generateMonth, setGenerateMonth] = useState(defaultMonth());
  const [generateEmployeeId, setGenerateEmployeeId] = useState<number | ''>('');
  const [generatePayoutMethod, setGeneratePayoutMethod] = useState<'mock' | 'stripe'>('mock');
  const [allowOverwrite, setAllowOverwrite] = useState(false);

  const [filterEmployeeId, setFilterEmployeeId] = useState<number | ''>('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterPayrollStatus, setFilterPayrollStatus] = useState<'' | 'draft' | 'processed' | 'paid'>('');
  const [filterPayoutStatus, setFilterPayoutStatus] = useState<'' | 'pending' | 'success' | 'failed'>('');

  const selectedId = selectedRecord?.id ?? null;

  const filteredPayload = useMemo(
    () => ({
      user_id: filterEmployeeId || undefined,
      payroll_month: filterMonth || undefined,
      payroll_status: filterPayrollStatus || undefined,
      payout_status: filterPayoutStatus || undefined,
    }),
    [filterEmployeeId, filterMonth, filterPayrollStatus, filterPayoutStatus]
  );

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [eRes, rRes] = await Promise.all([payrollApi.getEmployees(), payrollApi.getRecords(filteredPayload)]);
      setEmployees(eRes.data.data || []);
      setRecords(rRes.data.data || []);
      setPayrollMode(rRes.data.mode || 'mock');

      if (selectedId) {
        const nextSelected = (rRes.data.data || []).find((item) => item.id === selectedId) || null;
        setSelectedRecord(nextSelected);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load payroll records.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTransactions = async (id: number) => {
    try {
      const res = await payrollApi.getRecordTransactions(id);
      setTransactions(res.data.data || []);
    } catch {
      setTransactions([]);
    }
  };

  useEffect(() => {
    load();
  }, [filterEmployeeId, filterMonth, filterPayrollStatus, filterPayoutStatus]);

  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get('payment');
    if (payment === 'success') {
      setMessage('Stripe payment completed. Payout status will update shortly.');
    } else if (payment === 'cancelled') {
      setError('Stripe payment was cancelled.');
    }
  }, []);

  const onSelectRecord = async (record: PayrollRecord) => {
    setSelectedRecord(record);
    await loadTransactions(record.id);
  };

  const updateSelectedField = (key: keyof PayrollRecord, value: any) => {
    if (!selectedRecord) return;
    const next = { ...selectedRecord, [key]: value };
    const basic = Number(next.basic_salary || 0);
    const allowances = Number(next.allowances || 0);
    const bonus = Number(next.bonus || 0);
    const deductions = Number(next.deductions || 0);
    const tax = Number(next.tax || 0);
    next.net_salary = basic + allowances + bonus - deductions - tax;
    setSelectedRecord(next);
  };

  const persistSelectedDraft = async (showSuccessMessage = true) => {
    if (!selectedRecord) return;
    const res = await payrollApi.updateRecord(selectedRecord.id, {
      basic_salary: Number(selectedRecord.basic_salary || 0),
      allowances: Number(selectedRecord.allowances || 0),
      deductions: Number(selectedRecord.deductions || 0),
      bonus: Number(selectedRecord.bonus || 0),
      tax: Number(selectedRecord.tax || 0),
      payout_method: selectedRecord.payout_method,
    });
    setSelectedRecord(res.data);
    if (showSuccessMessage) {
      setMessage('Payroll record updated.');
    }
  };

  const saveSelected = async () => {
    if (!selectedRecord) return;
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      await persistSelectedDraft(true);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update payroll.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (status: 'draft' | 'processed' | 'paid') => {
    if (!selectedRecord) return;
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await payrollApi.updateRecordStatus(selectedRecord.id, status);
      setSelectedRecord(res.data);
      setMessage(`Payroll marked as ${status}.`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update payroll status.');
    } finally {
      setIsSaving(false);
    }
  };

  const payout = async (simulateStatus?: 'success' | 'failed' | 'pending') => {
    if (!selectedRecord) return;
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      // Save current salary edits before attempting payout so values do not reset.
      await persistSelectedDraft(false);

      const res = await payrollApi.payoutRecord(selectedRecord.id, {
        payout_method: selectedRecord.payout_method,
        simulate_status: simulateStatus,
      });
      setPayrollMode(res.data.mode);
      setSelectedRecord(res.data.payroll);
      setTransactions((prev) => [res.data.transaction, ...prev]);
      if (res.data.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setMessage('Payout action completed.');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to process payout.');
    } finally {
      setIsSaving(false);
    }
  };

  const generate = async () => {
    setIsGenerating(true);
    setMessage('');
    setError('');
    try {
      const res = await payrollApi.generateRecords({
        payroll_month: generateMonth,
        user_id: generateEmployeeId || undefined,
        payout_method: generatePayoutMethod,
        allow_overwrite: allowOverwrite,
      });
      const skippedReasons = Array.isArray(res.data.skipped) && res.data.skipped.length > 0
        ? ` Reasons: ${res.data.skipped.map((item: any) => item.reason).join(', ')}.`
        : '';
      setMessage(`Generated: ${res.data.generated_count}, skipped: ${res.data.skipped_count}.${skippedReasons}`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to generate payroll.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payroll Management</h1>
        <p className="text-gray-500 mt-1">Generate payroll, review salary breakdown, and complete payouts in mock or Stripe mode.</p>
      </div>

      {message ? <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
          <input type="month" value={generateMonth} onChange={(e) => setGenerateMonth(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Employee</label>
          <select value={generateEmployeeId} onChange={(e) => setGenerateEmployeeId(e.target.value ? Number(e.target.value) : '')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payout Method</label>
          <select value={generatePayoutMethod} onChange={(e) => setGeneratePayoutMethod(e.target.value as 'mock' | 'stripe')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="mock">Mock</option>
            <option value="stripe">Stripe</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={allowOverwrite} onChange={(e) => setAllowOverwrite(e.target.checked)} />
            Allow overwrite
          </label>
        </div>
        <div className="flex items-end md:col-span-2">
          <button onClick={generate} disabled={isGenerating} className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            {isGenerating ? 'Generating...' : 'Generate Payroll'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Filter Employee</label>
          <select value={filterEmployeeId} onChange={(e) => setFilterEmployeeId(e.target.value ? Number(e.target.value) : '')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Filter Month</label>
          <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payroll Status</label>
          <select value={filterPayrollStatus} onChange={(e) => setFilterPayrollStatus(e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="processed">Processed</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payout Status</label>
          <select value={filterPayoutStatus} onChange={(e) => setFilterPayoutStatus(e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => { setFilterEmployeeId(''); setFilterMonth(''); setFilterPayrollStatus(''); setFilterPayoutStatus(''); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            Clear Filters
          </button>
        </div>
        <div className="flex items-end">
          <button onClick={load} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-56">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Month</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Net Salary</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Payroll</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Payout</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td className="px-4 py-6 text-gray-500" colSpan={5}>No payroll records found.</td></tr>
                ) : records.map((record) => (
                  <tr
                    key={record.id}
                    className={`border-b border-gray-100 cursor-pointer ${selectedRecord?.id === record.id ? 'bg-primary-50' : ''}`}
                    onClick={() => onSelectRecord(record)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{record.user?.name || `#${record.user_id}`}</p>
                      <p className="text-xs text-gray-500">{record.user?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{record.payroll_month}</td>
                    <td className="px-4 py-3 text-gray-700">{money(record.net_salary)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${statusBadgeClass(record.payroll_status)}`}>{record.payroll_status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${statusBadgeClass(record.payout_status)}`}>{record.payout_status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Payroll Detail
            </h2>
            {!selectedRecord ? (
              <p className="text-sm text-gray-500">Select a payroll record from the list.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Basic Salary" value={selectedRecord.basic_salary} onChange={(v) => updateSelectedField('basic_salary', v)} />
                  <Field label="Allowances" value={selectedRecord.allowances} onChange={(v) => updateSelectedField('allowances', v)} />
                  <Field label="Bonus" value={selectedRecord.bonus} onChange={(v) => updateSelectedField('bonus', v)} />
                  <Field label="Deductions" value={selectedRecord.deductions} onChange={(v) => updateSelectedField('deductions', v)} />
                  <Field label="Tax" value={selectedRecord.tax} onChange={(v) => updateSelectedField('tax', v)} />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Payout Method</label>
                    <select value={selectedRecord.payout_method} onChange={(e) => updateSelectedField('payout_method', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="mock">Mock</option>
                      <option value="stripe">Stripe</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Gross Salary</p>
                  <p className="text-sm font-medium text-gray-900">{money(Number(selectedRecord.basic_salary || 0) + Number(selectedRecord.allowances || 0) + Number(selectedRecord.bonus || 0))}</p>
                  <p className="text-xs text-gray-600 mt-2">Total Deductions</p>
                  <p className="text-sm font-medium text-gray-900">{money(Number(selectedRecord.deductions || 0) + Number(selectedRecord.tax || 0))}</p>
                  <p className="text-xs text-gray-600 mt-2">Net Salary</p>
                  <p className="text-sm font-semibold text-gray-900">{money(selectedRecord.net_salary || 0)}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={saveSelected} disabled={isSaving} className="px-3 py-2 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Save Draft</button>
                  <button onClick={() => updateStatus('processed')} disabled={isSaving} className="px-3 py-2 text-xs rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">Mark Processed</button>
                  <button onClick={() => payout()} disabled={isSaving} className="px-3 py-2 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">Run Payout</button>
                </div>

                {payrollMode === 'mock' ? (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => payout('success')} disabled={isSaving} className="px-3 py-1.5 text-xs rounded-md bg-green-600 text-white hover:bg-green-700">Simulate Success</button>
                    <button onClick={() => payout('failed')} disabled={isSaving} className="px-3 py-1.5 text-xs rounded-md bg-red-600 text-white hover:bg-red-700">Simulate Failure</button>
                    <button onClick={() => payout('pending')} disabled={isSaving} className="px-3 py-1.5 text-xs rounded-md bg-amber-600 text-white hover:bg-amber-700">Simulate Pending</button>
                  </div>
                ) : null}

                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Transaction History</p>
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {transactions.length === 0 ? (
                      <p className="text-xs text-gray-500">No transactions yet.</p>
                    ) : transactions.map((tx) => (
                      <div key={tx.id} className="rounded-lg border border-gray-100 p-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-700">{tx.provider} {tx.transaction_id ? `(${tx.transaction_id})` : ''}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadgeClass(tx.status)}`}>{tx.status}</span>
                        </div>
                        <p className="text-[11px] text-gray-600 mt-1">{money(tx.amount)} - {new Date(tx.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        value={Number(value || 0)}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}

