<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PayrollAllowance;
use App\Models\PayrollDeduction;
use App\Models\Payroll;
use App\Models\PayrollTransaction;
use App\Models\PayrollStructure;
use App\Models\Payslip;
use App\Models\User;
use App\Services\AppNotificationService;
use App\Services\Payroll\PayrollCalculatorService;
use App\Services\Payroll\PayrollPayoutManager;
use App\Services\Payroll\StripePayrollPayoutService;
use Carbon\Carbon;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\View;

class PayrollController extends Controller
{
    public function __construct(
        private readonly AppNotificationService $notificationService,
        private readonly PayrollCalculatorService $payrollCalculatorService,
        private readonly PayrollPayoutManager $payrollPayoutManager,
        private readonly StripePayrollPayoutService $stripePayrollPayoutService,
    ) {
    }

    public function employees(Request $request)
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['data' => []]);
        }
        if (!$this->canManagePayroll($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $users = User::where('organization_id', $currentUser->organization_id)
            ->where('role', 'employee')
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role']);

        return response()->json(['data' => $users]);
    }

    public function records(Request $request)
    {
        $request->validate([
            'user_id' => 'nullable|integer',
            'payroll_month' => ['nullable', 'regex:/^\d{4}\-\d{2}$/'],
            'payroll_status' => 'nullable|in:draft,processed,paid',
            'payout_status' => 'nullable|in:pending,success,failed',
            'payout_method' => 'nullable|in:mock,stripe',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['data' => [], 'mode' => $this->payrollPayoutManager->mode()]);
        }
        if (!$this->canManagePayroll($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $query = Payroll::with(['user', 'generatedBy', 'updatedBy'])
            ->where('organization_id', $currentUser->organization_id)
            ->orderByDesc('payroll_month')
            ->orderByDesc('created_at');

        if ($request->filled('user_id')) {
            $query->where('user_id', (int) $request->user_id);
        }
        if ($request->filled('payroll_month')) {
            $query->where('payroll_month', $request->payroll_month);
        }
        if ($request->filled('payroll_status')) {
            $query->where('payroll_status', $request->payroll_status);
        }
        if ($request->filled('payout_status')) {
            $query->where('payout_status', $request->payout_status);
        }
        if ($request->filled('payout_method')) {
            $query->where('payout_method', $request->payout_method);
        }

        return response()->json([
            'data' => $query->get(),
            'mode' => $this->payrollPayoutManager->mode(),
        ]);
    }

    public function generateRecords(Request $request)
    {
        $request->validate([
            'payroll_month' => ['required', 'regex:/^\d{4}\-\d{2}$/'],
            'user_id' => 'nullable|integer',
            'allow_overwrite' => 'nullable|boolean',
            'payout_method' => 'nullable|in:mock,stripe',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Organization is required.'], 422);
        }
        if (!$this->canManagePayroll($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $periodStart = Carbon::createFromFormat('Y-m', $request->payroll_month)->startOfMonth();
        $employees = User::where('organization_id', $currentUser->organization_id)
            ->where('role', 'employee')
            ->when($request->filled('user_id'), fn ($q) => $q->where('id', (int) $request->user_id))
            ->orderBy('name')
            ->get();

        if ($employees->isEmpty()) {
            return response()->json(['message' => 'No employees found for payroll generation.'], 404);
        }

        $allowOverwrite = (bool) $request->boolean('allow_overwrite', false);
        $generated = [];
        $skipped = [];

        DB::transaction(function () use (
            $employees,
            $currentUser,
            $request,
            $periodStart,
            $allowOverwrite,
            &$generated,
            &$skipped
        ) {
            foreach ($employees as $employee) {
                $structure = $this->resolvePayrollStructure(
                    (int) $currentUser->organization_id,
                    (int) $employee->id,
                    $periodStart,
                    null
                );

                $existing = Payroll::where('organization_id', $currentUser->organization_id)
                    ->where('user_id', $employee->id)
                    ->where('payroll_month', $request->payroll_month)
                    ->first();

                if ($existing && !$allowOverwrite) {
                    $skipped[] = [
                        'employee_id' => (int) $employee->id,
                        'reason' => 'Payroll already exists for this month',
                    ];
                    continue;
                }

                if ($structure) {
                    [, $allowanceTotal] = $this->computeComponents($structure->allowances->toArray(), (float) $structure->basic_salary);
                    [, $deductionTotal] = $this->computeComponents($structure->deductions->toArray(), (float) $structure->basic_salary);
                    $basicSalary = round((float) $structure->basic_salary, 2);
                    $allowances = round((float) $allowanceTotal, 2);
                    $deductions = round((float) $deductionTotal, 2);
                    $bonus = 0.0;
                    $tax = 0.0;
                } else {
                    // Fallback: generate a draft payroll even when structure is missing.
                    $lastPayroll = Payroll::where('organization_id', $currentUser->organization_id)
                        ->where('user_id', $employee->id)
                        ->orderByDesc('payroll_month')
                        ->orderByDesc('id')
                        ->first();

                    $basicSalary = round((float) ($lastPayroll?->basic_salary ?? 0), 2);
                    $allowances = round((float) ($lastPayroll?->allowances ?? 0), 2);
                    $deductions = round((float) ($lastPayroll?->deductions ?? 0), 2);
                    $bonus = round((float) ($lastPayroll?->bonus ?? 0), 2);
                    $tax = round((float) ($lastPayroll?->tax ?? 0), 2);
                }

                $netSalary = $this->payrollCalculatorService->calculateNetSalary(
                    $basicSalary,
                    $allowances,
                    $bonus,
                    $deductions,
                    $tax
                );

                $payload = [
                    'basic_salary' => $basicSalary,
                    'allowances' => $allowances,
                    'deductions' => $deductions,
                    'bonus' => $bonus,
                    'tax' => $tax,
                    'net_salary' => $netSalary,
                    'payroll_status' => 'draft',
                    'payout_method' => (string) ($request->payout_method ?: 'mock'),
                    'payout_status' => 'pending',
                    'generated_by' => $currentUser->id,
                    'updated_by' => $currentUser->id,
                ];

                if ($existing) {
                    $existing->update($payload);
                    $generated[] = $existing->fresh();
                    continue;
                }

                $generated[] = Payroll::create(array_merge($payload, [
                    'organization_id' => $currentUser->organization_id,
                    'user_id' => $employee->id,
                    'payroll_month' => $request->payroll_month,
                ]));
            }
        });

        return response()->json([
            'message' => 'Payroll generation completed.',
            'generated_count' => count($generated),
            'skipped_count' => count($skipped),
            'generated' => collect($generated)->values(),
            'skipped' => $skipped,
        ]);
    }

    public function showRecord(Request $request, int $id)
    {
        $record = $this->findPayrollRecord($request, $id);
        if (!$record) {
            return response()->json(['message' => 'Payroll record not found'], 404);
        }

        return response()->json($record->load(['user', 'generatedBy', 'updatedBy', 'transactions']));
    }

    public function updateRecord(Request $request, int $id)
    {
        $request->validate([
            'basic_salary' => 'nullable|numeric|min:0',
            'allowances' => 'nullable|numeric|min:0',
            'deductions' => 'nullable|numeric|min:0',
            'bonus' => 'nullable|numeric|min:0',
            'tax' => 'nullable|numeric|min:0',
            'payroll_status' => 'nullable|in:draft,processed,paid',
            'payout_method' => 'nullable|in:mock,stripe',
        ]);

        $record = $this->findPayrollRecord($request, $id);
        if (!$record) {
            return response()->json(['message' => 'Payroll record not found'], 404);
        }

        if ($record->payroll_status === 'paid') {
            return response()->json(['message' => 'Paid payroll cannot be edited.'], 422);
        }

        $currentUser = $request->user();
        $record->fill($request->only(['basic_salary', 'allowances', 'deductions', 'bonus', 'tax', 'payroll_status', 'payout_method']));
        $record->net_salary = $this->payrollCalculatorService->calculateNetSalary(
            (float) $record->basic_salary,
            (float) $record->allowances,
            (float) $record->bonus,
            (float) $record->deductions,
            (float) $record->tax
        );
        $record->updated_by = $currentUser?->id;
        $record->save();

        return response()->json($record->fresh()->load(['user', 'generatedBy', 'updatedBy']));
    }

    public function updateRecordStatus(Request $request, int $id)
    {
        $request->validate([
            'payroll_status' => 'required|in:draft,processed,paid',
        ]);

        $record = $this->findPayrollRecord($request, $id);
        if (!$record) {
            return response()->json(['message' => 'Payroll record not found'], 404);
        }

        $nextStatus = (string) $request->payroll_status;
        if ($nextStatus === 'paid' && $record->payout_status !== 'success') {
            return response()->json(['message' => 'Payroll can be marked paid only after successful payout.'], 422);
        }

        $record->payroll_status = $nextStatus;
        $record->processed_at = $nextStatus === 'processed' ? now() : $record->processed_at;
        $record->paid_at = $nextStatus === 'paid' ? now() : $record->paid_at;
        $record->updated_by = $request->user()?->id;
        $record->save();

        return response()->json($record->fresh());
    }

    public function payoutRecord(Request $request, int $id)
    {
        $request->validate([
            'payout_method' => 'nullable|in:mock,stripe',
            'simulate_status' => 'nullable|in:success,failed,pending',
        ]);

        $record = $this->findPayrollRecord($request, $id);
        if (!$record) {
            return response()->json(['message' => 'Payroll record not found'], 404);
        }

        if ($record->payroll_status === 'draft') {
            return response()->json(['message' => 'Process payroll before payout.'], 422);
        }
        if ((float) $record->net_salary <= 0) {
            return response()->json(['message' => 'Net salary must be greater than 0 before payout.'], 422);
        }

        $currentUser = $request->user();
        if ($request->filled('payout_method')) {
            $record->payout_method = (string) $request->payout_method;
        }

        try {
            $service = $this->payrollPayoutManager->resolveForCurrentMode();
            $result = $service->payout($record->loadMissing('user'), $request->get('simulate_status'));
        } catch (\Throwable $e) {
            Log::error('Payroll payout failed', [
                'payroll_id' => $record->id,
                'user_id' => $currentUser?->id,
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Payout failed: '.$e->getMessage(),
            ], 422);
        }

        $transaction = PayrollTransaction::create([
            'payroll_id' => $record->id,
            'provider' => $result['provider'],
            'transaction_id' => $result['transaction_id'] ?: null,
            'amount' => (float) $record->net_salary,
            'currency' => (string) config('payroll.default_currency', 'INR'),
            'status' => $result['status'],
            'raw_response' => $result['raw_response'],
        ]);

        $record->payout_status = $result['status'];
        $record->updated_by = $currentUser?->id;
        if ($result['status'] === 'success') {
            $record->payroll_status = 'paid';
            $record->paid_at = now();
            $this->sendPayrollPaidNotification($record->fresh('user'), $currentUser?->id);
        } elseif ($record->payroll_status === 'draft') {
            $record->payroll_status = 'processed';
            $record->processed_at = now();
        }
        $record->save();

        return response()->json([
            'mode' => $this->payrollPayoutManager->mode(),
            'payroll' => $record->fresh()->load(['user', 'transactions']),
            'transaction' => $transaction,
            'checkout_url' => $result['checkout_url'] ?? null,
        ]);
    }

    public function recordTransactions(Request $request, int $id)
    {
        $record = $this->findPayrollRecord($request, $id);
        if (!$record) {
            return response()->json(['data' => []]);
        }

        return response()->json([
            'data' => $record->transactions()->latest()->get(),
        ]);
    }

    public function stripeWebhook(Request $request)
    {
        $mode = $this->payrollPayoutManager->mode();
        if (!in_array($mode, ['stripe_test', 'stripe_live'], true)) {
            return response()->json(['message' => 'Stripe webhook ignored in current payroll mode.'], 400);
        }

        $payload = $request->getContent();
        $signature = (string) $request->header('Stripe-Signature', '');
        if (!$this->stripePayrollPayoutService->verifyWebhookSignature($payload, $signature)) {
            return response()->json(['message' => 'Invalid webhook signature'], 400);
        }

        $event = json_decode($payload, true);
        if (!is_array($event)) {
            return response()->json(['message' => 'Invalid payload'], 400);
        }

        $type = (string) ($event['type'] ?? '');
        $eventData = $event['data']['object'] ?? null;
        if (!is_array($eventData)) {
            return response()->json(['received' => true]);
        }

        if (!in_array($type, [
            'payment_intent.succeeded',
            'payment_intent.processing',
            'payment_intent.payment_failed',
            'checkout.session.completed',
            'checkout.session.expired',
            'checkout.session.async_payment_failed',
        ], true)) {
            return response()->json(['received' => true]);
        }

        $transaction = null;
        $mappedStatus = 'pending';

        if (str_starts_with($type, 'payment_intent.')) {
            $paymentIntentId = (string) ($eventData['id'] ?? '');
            if ($paymentIntentId === '') {
                return response()->json(['received' => true]);
            }

            $transaction = PayrollTransaction::query()
                ->where('provider', 'stripe')
                ->where(function ($q) use ($paymentIntentId) {
                    $q->where('transaction_id', $paymentIntentId)
                        ->orWhere('raw_response->payment_intent', $paymentIntentId);
                })
                ->latest()
                ->first();

            $mappedStatus = $this->stripePayrollPayoutService->mapStripeStatusToPayoutStatus((string) ($eventData['status'] ?? ''));
        } elseif (str_starts_with($type, 'checkout.session.')) {
            $sessionId = (string) ($eventData['id'] ?? '');
            if ($sessionId === '') {
                return response()->json(['received' => true]);
            }

            $transaction = PayrollTransaction::query()
                ->where('provider', 'stripe')
                ->where('transaction_id', $sessionId)
                ->latest()
                ->first();

            $mappedStatus = match ($type) {
                'checkout.session.completed' => 'success',
                'checkout.session.expired', 'checkout.session.async_payment_failed' => 'failed',
                default => 'pending',
            };
        }

        if (!$transaction) {
            return response()->json(['received' => true]);
        }

        $wasSuccess = $transaction->status === 'success';
        $transaction->update([
            'status' => $mappedStatus,
            'raw_response' => $event,
        ]);

        $payroll = Payroll::find($transaction->payroll_id);
        if ($payroll) {
            $previousPayrollStatus = $payroll->payout_status;
            $payroll->payout_status = $mappedStatus;
            if ($mappedStatus === 'success') {
                $payroll->payroll_status = 'paid';
                $payroll->paid_at = now();
            }
            $payroll->save();

            if (!$wasSuccess && $previousPayrollStatus !== 'success' && $mappedStatus === 'success') {
                $this->sendPayrollPaidNotification($payroll->loadMissing('user'));
            }
        }

        return response()->json(['received' => true]);
    }

    public function structures(Request $request)
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['users' => [], 'structures' => []]);
        }

        $users = User::where('organization_id', $currentUser->organization_id)
            ->when(!$this->canManagePayroll($currentUser), fn ($q) => $q->where('id', $currentUser->id))
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role']);

        $structureQuery = PayrollStructure::with(['allowances', 'deductions', 'user'])
            ->where('organization_id', $currentUser->organization_id)
            ->whereIn('user_id', $users->pluck('id'))
            ->where('is_active', true)
            ->orderByDesc('effective_from');

        if ($request->filled('user_id')) {
            $structureQuery->where('user_id', (int) $request->user_id);
        }

        return response()->json([
            'users' => $users,
            'structures' => $structureQuery->get(),
        ]);
    }

    public function upsertStructure(Request $request)
    {
        $request->validate([
            'user_id' => 'required|integer',
            'basic_salary' => 'required|numeric|min:0',
            'currency' => 'nullable|in:INR,USD',
            'effective_from' => 'required|date',
            'allowances' => 'nullable|array',
            'allowances.*.name' => 'required_with:allowances|string|max:100',
            'allowances.*.calculation_type' => 'required_with:allowances|in:fixed,percentage',
            'allowances.*.amount' => 'required_with:allowances|numeric|min:0',
            'deductions' => 'nullable|array',
            'deductions.*.name' => 'required_with:deductions|string|max:100',
            'deductions.*.calculation_type' => 'required_with:deductions|in:fixed,percentage',
            'deductions.*.amount' => 'required_with:deductions|numeric|min:0',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Organization is required.'], 422);
        }

        if (!$this->canManagePayroll($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $targetUser = User::where('organization_id', $currentUser->organization_id)
            ->where('id', (int) $request->user_id)
            ->first();

        if (!$targetUser) {
            return response()->json(['message' => 'User not found in your organization'], 404);
        }

        $structure = DB::transaction(function () use ($request, $currentUser, $targetUser) {
            PayrollStructure::where('organization_id', $currentUser->organization_id)
                ->where('user_id', $targetUser->id)
                ->where('is_active', true)
                ->update([
                    'is_active' => false,
                    'effective_to' => Carbon::parse($request->effective_from)->copy()->subDay()->toDateString(),
                    'updated_at' => now(),
                ]);

            $structure = PayrollStructure::create([
                'organization_id' => $currentUser->organization_id,
                'user_id' => $targetUser->id,
                'basic_salary' => (float) $request->basic_salary,
                'currency' => strtoupper((string) ($request->currency ?: 'INR')),
                'effective_from' => $request->effective_from,
                'effective_to' => null,
                'is_active' => true,
            ]);

            foreach (($request->allowances ?? []) as $item) {
                PayrollAllowance::create([
                    'payroll_structure_id' => $structure->id,
                    'name' => $item['name'],
                    'calculation_type' => $item['calculation_type'],
                    'amount' => (float) $item['amount'],
                ]);
            }

            foreach (($request->deductions ?? []) as $item) {
                PayrollDeduction::create([
                    'payroll_structure_id' => $structure->id,
                    'name' => $item['name'],
                    'calculation_type' => $item['calculation_type'],
                    'amount' => (float) $item['amount'],
                ]);
            }

            return $structure;
        });

        return response()->json($structure->load(['allowances', 'deductions', 'user']), 201);
    }

    public function updateStructure(Request $request, int $id)
    {
        $request->validate([
            'basic_salary' => 'required|numeric|min:0',
            'currency' => 'nullable|in:INR,USD',
            'effective_from' => 'required|date',
            'allowances' => 'nullable|array',
            'allowances.*.name' => 'required_with:allowances|string|max:100',
            'allowances.*.calculation_type' => 'required_with:allowances|in:fixed,percentage',
            'allowances.*.amount' => 'required_with:allowances|numeric|min:0',
            'deductions' => 'nullable|array',
            'deductions.*.name' => 'required_with:deductions|string|max:100',
            'deductions.*.calculation_type' => 'required_with:deductions|in:fixed,percentage',
            'deductions.*.amount' => 'required_with:deductions|numeric|min:0',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Organization is required.'], 422);
        }
        if (!$this->canManagePayroll($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $structure = PayrollStructure::where('organization_id', $currentUser->organization_id)->find($id);
        if (!$structure) {
            return response()->json(['message' => 'Payroll structure not found'], 404);
        }

        DB::transaction(function () use ($request, $structure) {
            $structure->update([
                'basic_salary' => (float) $request->basic_salary,
                'currency' => strtoupper((string) ($request->currency ?: 'INR')),
                'effective_from' => $request->effective_from,
            ]);

            $structure->allowances()->delete();
            foreach (($request->allowances ?? []) as $item) {
                PayrollAllowance::create([
                    'payroll_structure_id' => $structure->id,
                    'name' => $item['name'],
                    'calculation_type' => $item['calculation_type'],
                    'amount' => (float) $item['amount'],
                ]);
            }

            $structure->deductions()->delete();
            foreach (($request->deductions ?? []) as $item) {
                PayrollDeduction::create([
                    'payroll_structure_id' => $structure->id,
                    'name' => $item['name'],
                    'calculation_type' => $item['calculation_type'],
                    'amount' => (float) $item['amount'],
                ]);
            }
        });

        return response()->json($structure->fresh()->load(['allowances', 'deductions', 'user']));
    }

    public function deleteStructure(Request $request, int $id)
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Organization is required.'], 422);
        }
        if (!$this->canManagePayroll($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $structure = PayrollStructure::where('organization_id', $currentUser->organization_id)->find($id);
        if (!$structure) {
            return response()->json(['message' => 'Payroll structure not found'], 404);
        }

        $structure->delete();

        return response()->json(['message' => 'Payroll structure deleted.']);
    }

    public function payslips(Request $request)
    {
        $request->validate([
            'user_id' => 'nullable|integer',
            'period_month' => ['nullable', 'regex:/^\d{4}\-\d{2}$/'],
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['data' => []]);
        }

        $query = Payslip::with(['user', 'generatedBy', 'payrollStructure'])
            ->where('organization_id', $currentUser->organization_id)
            ->orderByDesc('period_month')
            ->orderByDesc('generated_at');

        if ($request->filled('period_month')) {
            $query->where('period_month', $request->period_month);
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', (int) $request->user_id);
        } elseif (!$this->canManagePayroll($currentUser)) {
            $query->where('user_id', $currentUser->id);
        }

        return response()->json(['data' => $query->get()]);
    }

    public function generatePayslip(Request $request)
    {
        $request->validate([
            'user_id' => 'required|integer',
            'period_month' => ['required', 'regex:/^\d{4}\-\d{2}$/'],
            'payroll_structure_id' => 'nullable|integer',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Organization is required.'], 422);
        }

        if (!$this->canManagePayroll($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $targetUser = User::where('organization_id', $currentUser->organization_id)
            ->where('id', (int) $request->user_id)
            ->first();
        if (!$targetUser) {
            return response()->json(['message' => 'User not found in your organization'], 404);
        }

        $periodStart = Carbon::createFromFormat('Y-m', $request->period_month)->startOfMonth();
        $periodEnd = $periodStart->copy()->endOfMonth();

        $structure = $this->resolvePayrollStructure(
            $currentUser->organization_id,
            $targetUser->id,
            $periodStart,
            $request->get('payroll_structure_id')
        );
        if (!$structure) {
            return response()->json(['message' => 'No payroll structure found for selected period'], 422);
        }

        $basicSalary = (float) $structure->basic_salary;
        [$allowances, $allowanceTotal] = $this->computeComponents($structure->allowances->toArray(), $basicSalary);
        [$deductions, $deductionTotal] = $this->computeComponents($structure->deductions->toArray(), $basicSalary);
        $net = max(0, $basicSalary + $allowanceTotal - $deductionTotal);

        $payslip = Payslip::updateOrCreate(
            [
                'organization_id' => $currentUser->organization_id,
                'user_id' => $targetUser->id,
                'period_month' => $request->period_month,
            ],
            [
                'payroll_structure_id' => $structure->id,
                'currency' => $structure->currency ?: 'INR',
                'basic_salary' => round($basicSalary, 2),
                'total_allowances' => round($allowanceTotal, 2),
                'total_deductions' => round($deductionTotal, 2),
                'net_salary' => round($net, 2),
                'allowances' => $allowances,
                'deductions' => $deductions,
                'generated_by' => $currentUser->id,
                'generated_at' => now(),
                'payment_status' => 'pending',
                'paid_at' => null,
                'paid_by' => null,
            ]
        );

        return response()->json($payslip->load(['user', 'generatedBy', 'payrollStructure']), 201);
    }

    public function payNow(Request $request)
    {
        $request->validate([
            'payslip_ids' => 'required|array|min:1',
            'payslip_ids.*' => 'integer',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Organization is required.'], 422);
        }
        if (!$this->canManagePayroll($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $payslips = Payslip::where('organization_id', $currentUser->organization_id)
            ->whereIn('id', collect($request->payslip_ids)->map(fn ($id) => (int) $id)->values())
            ->get();
        if ($payslips->isEmpty()) {
            return response()->json(['message' => 'No valid payslips found for payment'], 404);
        }

        $toPay = $payslips->filter(fn (Payslip $payslip) => $payslip->payment_status !== 'paid')->values();
        if ($toPay->isEmpty()) {
            return response()->json([
                'message' => 'Selected payslips are already paid.',
                'paid_count' => 0,
            ]);
        }

        DB::transaction(function () use ($toPay, $currentUser) {
            foreach ($toPay as $payslip) {
                $payslip->update([
                    'payment_status' => 'paid',
                    'paid_at' => now(),
                    'paid_by' => $currentUser->id,
                ]);
            }
        });

        $freshPayslips = Payslip::whereIn('id', $toPay->pluck('id'))->get();
        $userGroups = $freshPayslips->groupBy('user_id');
        foreach ($userGroups as $userId => $userPayslips) {
            $total = round((float) $userPayslips->sum('net_salary'), 2);
            $currency = (string) ($userPayslips->first()->currency ?: 'INR');
            $periods = $userPayslips->pluck('period_month')->unique()->sort()->values()->join(', ');

            $this->notificationService->sendToUsers(
                organizationId: (int) $currentUser->organization_id,
                userIds: collect([(int) $userId]),
                senderId: (int) $currentUser->id,
                type: 'salary_credited',
                title: 'Salary Credited',
                message: "Your salary has been credited for period(s): {$periods}.",
                meta: [
                    'currency' => $currency,
                    'total_amount' => $total,
                    'periods' => $userPayslips->pluck('period_month')->unique()->values()->all(),
                    'payslip_ids' => $userPayslips->pluck('id')->values()->all(),
                ]
            );
        }

        return response()->json([
            'message' => 'Payment processed and notifications sent.',
            'paid_count' => $freshPayslips->count(),
        ]);
    }

    public function showPayslip(Request $request, int $id)
    {
        $payslip = $this->findPayslip($request, $id);
        if (!$payslip) {
            return response()->json(['message' => 'Payslip not found'], 404);
        }

        return response()->json($payslip->load(['user', 'generatedBy', 'payrollStructure']));
    }

    public function downloadPayslipPdf(Request $request, int $id)
    {
        $payslip = $this->findPayslip($request, $id);
        if (!$payslip) {
            return response()->json(['message' => 'Payslip not found'], 404);
        }

        $payslip->load(['user', 'generatedBy']);
        $html = View::make('payslips.pdf', ['payslip' => $payslip])->render();

        $options = new Options();
        $options->set('isRemoteEnabled', true);

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        $fileName = 'payslip-'.$payslip->user->name.'-'.$payslip->period_month.'.pdf';

        return response($dompdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$fileName.'"',
        ]);
    }

    private function resolvePayrollStructure(int $organizationId, int $userId, Carbon $periodStart, ?int $structureId): ?PayrollStructure
    {
        $query = PayrollStructure::with(['allowances', 'deductions'])
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId);

        if ($structureId) {
            return $query->where('id', $structureId)->first();
        }

        return $query
            ->whereDate('effective_from', '<=', $periodStart->toDateString())
            ->where(function ($q) use ($periodStart) {
                $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $periodStart->toDateString());
            })
            ->orderByDesc('effective_from')
            ->first();
    }

    private function computeComponents(array $items, float $basicSalary): array
    {
        $rows = [];
        $total = 0.0;

        foreach ($items as $item) {
            $type = (string) ($item['calculation_type'] ?? 'fixed');
            $amount = (float) ($item['amount'] ?? 0);
            $computed = $type === 'percentage'
                ? round(($basicSalary * $amount) / 100, 2)
                : round($amount, 2);

            $rows[] = [
                'name' => (string) ($item['name'] ?? 'Component'),
                'calculation_type' => $type,
                'value' => $amount,
                'computed_amount' => $computed,
            ];
            $total += $computed;
        }

        return [$rows, round($total, 2)];
    }

    private function findPayslip(Request $request, int $id): ?Payslip
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return null;
        }

        $query = Payslip::where('organization_id', $currentUser->organization_id)->where('id', $id);
        if (!$this->canManagePayroll($currentUser)) {
            $query->where('user_id', $currentUser->id);
        }

        return $query->first();
    }

    private function findPayrollRecord(Request $request, int $id): ?Payroll
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return null;
        }
        if (!$this->canManagePayroll($currentUser)) {
            return null;
        }

        return Payroll::where('organization_id', $currentUser->organization_id)
            ->where('id', $id)
            ->first();
    }

    private function canManagePayroll(User $user): bool
    {
        return in_array($user->role, ['admin', 'manager'], true);
    }

    private function sendPayrollPaidNotification(Payroll $payroll, ?int $senderId = null): void
    {
        if (!$payroll->organization_id || !$payroll->user_id) {
            return;
        }

        $currency = (string) config('payroll.default_currency', 'INR');
        $amount = round((float) $payroll->net_salary, 2);
        $period = (string) $payroll->payroll_month;

        $this->notificationService->sendToUsers(
            organizationId: (int) $payroll->organization_id,
            userIds: collect([(int) $payroll->user_id]),
            senderId: $senderId,
            type: 'salary_credited',
            title: 'Salary Credited',
            message: "Your salary of {$currency} {$amount} was paid today for {$period}.",
            meta: [
                'payroll_id' => $payroll->id,
                'period_month' => $period,
                'currency' => $currency,
                'amount' => $amount,
                'paid_at' => optional($payroll->paid_at)->toIso8601String(),
            ]
        );
    }
}
