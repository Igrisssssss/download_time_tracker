<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Services\Audit\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class InvoiceController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->organization_id) {
            return response()->json(['data' => []]);
        }

        $invoices = Invoice::where('organization_id', $user->organization_id)
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->orderBy('created_at', 'desc')
            ->paginate((int) $request->get('per_page', 15));

        return response()->json($invoices);
    }

    public function store(Request $request)
    {
        $request->validate([
            'client_name' => 'required|string|max:255',
            'client_email' => 'required|email',
            'client_address' => 'nullable|string',
            'subtotal' => 'nullable|numeric|min:0',
            'tax' => 'nullable|numeric|min:0',
            'total' => 'nullable|numeric|min:0',
            'status' => 'nullable|in:draft,sent,paid,overdue,cancelled',
            'due_date' => 'required|date',
            'invoice_date' => 'nullable|date',
            'items' => 'nullable|array',
            'items.*.description' => 'required_with:items|string',
            'items.*.quantity' => 'nullable|integer|min:1',
            'items.*.hours' => 'nullable|integer|min:1',
            'items.*.rate' => 'required_with:items|numeric|min:0',
        ]);

        $user = $request->user();
        if (!$user || !$user->organization_id) {
            return response()->json(['message' => 'Organization is required.'], 422);
        }

        $items = [];
        $computedSubtotal = 0.0;

        foreach (($request->items ?? []) as $item) {
            $hours = (int) ($item['hours'] ?? $item['quantity'] ?? 1);
            $rate = (float) ($item['rate'] ?? 0);
            $amount = round($hours * $rate, 2);
            $computedSubtotal += $amount;
            $items[] = [
                'description' => $item['description'],
                'hours' => $hours,
                'rate' => $rate,
                'amount' => $amount,
                'time_entry_id' => $item['time_entry_id'] ?? null,
            ];
        }

        $subtotal = (float) ($request->subtotal ?? $computedSubtotal);
        $tax = (float) ($request->tax ?? 0);
        $total = (float) ($request->total ?? ($subtotal + $tax));

        $invoice = Invoice::create([
            'organization_id' => $user->organization_id,
            'invoice_number' => $this->generateInvoiceNumber(),
            'client_name' => $request->client_name,
            'client_email' => $request->client_email,
            'client_address' => $request->client_address,
            'subtotal' => $subtotal,
            'tax' => $tax,
            'total' => $total,
            'status' => $request->status ?? 'draft',
            'due_date' => $request->due_date,
        ]);

        if (!empty($items)) {
            foreach ($items as $item) {
                $invoice->items()->create($item);
            }
        }

        $this->auditLogService->log(
            action: 'invoice.created',
            actor: $user,
            target: $invoice,
            metadata: [
                'invoice_number' => $invoice->invoice_number,
                'status' => $invoice->status,
                'total' => (float) $invoice->total,
                'items_count' => count($items),
            ],
            request: $request
        );

        return response()->json($invoice->load('items'), 201);
    }

    public function show(Invoice $invoice)
    {
        if (!$this->canAccessInvoice($invoice)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return response()->json($invoice->load('items'));
    }

    public function update(Request $request, Invoice $invoice)
    {
        if (!$this->canAccessInvoice($invoice)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $request->validate([
            'client_name' => 'sometimes|string|max:255',
            'client_email' => 'sometimes|email',
            'client_address' => 'nullable|string',
            'subtotal' => 'nullable|numeric|min:0',
            'tax' => 'nullable|numeric|min:0',
            'total' => 'nullable|numeric|min:0',
            'status' => 'sometimes|in:draft,sent,paid,overdue,cancelled',
            'due_date' => 'nullable|date',
            'items' => 'nullable|array',
            'items.*.description' => 'required_with:items|string',
            'items.*.quantity' => 'nullable|integer|min:1',
            'items.*.hours' => 'nullable|integer|min:1',
            'items.*.rate' => 'required_with:items|numeric|min:0',
        ]);

        $before = $invoice->only(['client_name', 'client_email', 'subtotal', 'tax', 'total', 'status', 'due_date']);
        $invoice->update($request->only([
            'client_name',
            'client_email',
            'client_address',
            'subtotal',
            'tax',
            'total',
            'status',
            'due_date',
        ]));

        if (is_array($request->items)) {
            $invoice->items()->delete();
            $subtotal = 0.0;

            foreach ($request->items as $item) {
                $hours = (int) ($item['hours'] ?? $item['quantity'] ?? 1);
                $rate = (float) ($item['rate'] ?? 0);
                $amount = round($hours * $rate, 2);
                $subtotal += $amount;

                $invoice->items()->create([
                    'description' => $item['description'],
                    'hours' => $hours,
                    'rate' => $rate,
                    'amount' => $amount,
                    'time_entry_id' => $item['time_entry_id'] ?? null,
                ]);
            }

            $tax = (float) $invoice->tax;
            $invoice->update([
                'subtotal' => $subtotal,
                'total' => $subtotal + $tax,
            ]);
        }

        $this->auditLogService->log(
            action: 'invoice.updated',
            actor: $request->user(),
            target: $invoice,
            metadata: [
                'invoice_number' => $invoice->invoice_number,
                'before' => $before,
                'after' => $invoice->fresh()->only(['client_name', 'client_email', 'subtotal', 'tax', 'total', 'status', 'due_date']),
            ],
            request: $request
        );

        return response()->json($invoice);
    }

    public function destroy(Invoice $invoice)
    {
        if (!$this->canAccessInvoice($invoice)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $this->auditLogService->log(
            action: 'invoice.deleted',
            actor: request()->user(),
            target: $invoice,
            metadata: [
                'invoice_number' => $invoice->invoice_number,
                'status' => $invoice->status,
                'total' => (float) $invoice->total,
            ],
            request: request()
        );

        $invoice->delete();

        return response()->json(['message' => 'Invoice deleted']);
    }

    public function send(int $id)
    {
        $invoice = $this->findScopedInvoice($id);
        if (!$invoice) {
            return response()->json(['message' => 'Invoice not found'], 404);
        }

        $invoice->update(['status' => 'sent']);
        $this->auditLogService->log(
            action: 'invoice.sent',
            actor: request()->user(),
            target: $invoice,
            metadata: [
                'invoice_number' => $invoice->invoice_number,
            ],
            request: request()
        );
        return response()->json($invoice);
    }

    public function markPaid(int $id)
    {
        $invoice = $this->findScopedInvoice($id);
        if (!$invoice) {
            return response()->json(['message' => 'Invoice not found'], 404);
        }

        $invoice->update([
            'status' => 'paid',
            'paid_at' => now()->toDateString(),
        ]);

        $this->auditLogService->log(
            action: 'invoice.marked_paid',
            actor: request()->user(),
            target: $invoice,
            metadata: [
                'invoice_number' => $invoice->invoice_number,
                'paid_at' => $invoice->paid_at,
                'total' => (float) $invoice->total,
            ],
            request: request()
        );

        return response()->json($invoice);
    }

    private function generateInvoiceNumber(): string
    {
        do {
            $candidate = 'INV-'.now()->format('Ymd').'-'.Str::upper(Str::random(6));
        } while (Invoice::where('invoice_number', $candidate)->exists());

        return $candidate;
    }

    private function canAccessInvoice(Invoice $invoice): bool
    {
        $user = request()->user();
        return $user && $user->organization_id === $invoice->organization_id;
    }

    private function findScopedInvoice(int $id): ?Invoice
    {
        $user = request()->user();
        if (!$user || !$user->organization_id) {
            return null;
        }

        return Invoice::where('organization_id', $user->organization_id)->where('id', $id)->first();
    }
}
