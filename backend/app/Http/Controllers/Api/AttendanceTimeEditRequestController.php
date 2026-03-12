<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRecord;
use App\Models\AttendanceTimeEditRequest;
use App\Models\User;
use App\Services\AppNotificationService;
use App\Services\Audit\AuditLogService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class AttendanceTimeEditRequestController extends Controller
{
    public function __construct(
        private readonly AppNotificationService $notificationService,
        private readonly AuditLogService $auditLogService,
    ) {
    }

    public function index(Request $request)
    {
        $request->validate([
            'status' => 'nullable|in:pending,approved,rejected',
            'user_id' => 'nullable|integer',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['data' => []]);
        }

        $query = AttendanceTimeEditRequest::with(['user:id,name,email,role', 'reviewer:id,name,email'])
            ->where('organization_id', $currentUser->organization_id)
            ->orderByDesc('created_at');

        if (!$this->canManage($currentUser)) {
            $query->where('user_id', $currentUser->id);
        } elseif ($request->filled('user_id')) {
            $query->where('user_id', (int) $request->user_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json([
            'data' => $query->limit(200)->get(),
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'attendance_date' => 'required|date',
            'extra_minutes' => 'required|integer|min:1|max:600',
            'message' => 'nullable|string|max:2000',
            'worked_seconds' => 'nullable|integer|min:0|max:172800',
            'overtime_seconds' => 'nullable|integer|min:0|max:86400',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Organization is required.'], 422);
        }

        $date = Carbon::parse($request->attendance_date)->toDateString();
        $extraSeconds = (int) $request->extra_minutes * 60;

        $hasPending = AttendanceTimeEditRequest::where('organization_id', $currentUser->organization_id)
            ->where('user_id', $currentUser->id)
            ->whereDate('attendance_date', $date)
            ->where('status', 'pending')
            ->exists();
        if ($hasPending) {
            return response()->json(['message' => 'A pending time edit request already exists for this date.'], 422);
        }

        $created = AttendanceTimeEditRequest::create([
            'organization_id' => $currentUser->organization_id,
            'user_id' => $currentUser->id,
            'attendance_date' => $date,
            'extra_seconds' => $extraSeconds,
            'message' => $request->message,
            'status' => 'pending',
        ]);

        $record = AttendanceRecord::query()
            ->where('organization_id', $currentUser->organization_id)
            ->where('user_id', $currentUser->id)
            ->whereDate('attendance_date', $date)
            ->first();
        $recordWorkedSeconds = (int) (($record?->worked_seconds ?? 0) + ($record?->manual_adjustment_seconds ?? 0));
        $workedSeconds = max($recordWorkedSeconds, (int) $request->integer('worked_seconds', 0));
        $overtimeSeconds = (int) max(
            $request->integer('overtime_seconds', 0),
            $extraSeconds,
            max(0, $workedSeconds - $this->shiftTargetSeconds())
        );

        $adminRecipientIds = User::query()
            ->where('organization_id', $currentUser->organization_id)
            ->whereIn('role', ['admin', 'manager'])
            ->pluck('id');

        $this->notificationService->sendToUsers(
            organizationId: (int) $currentUser->organization_id,
            userIds: $adminRecipientIds,
            senderId: (int) $currentUser->id,
            type: 'announcement',
            title: 'Overtime Proof Submitted',
            message: sprintf(
                '%s submitted overtime proof for %s. Worked: %s, Overtime: %s.',
                (string) $currentUser->name,
                $date,
                $this->formatDuration($workedSeconds),
                $this->formatDuration($overtimeSeconds)
            ),
            meta: [
                'request_id' => $created->id,
                'employee_id' => (int) $currentUser->id,
                'employee_name' => (string) $currentUser->name,
                'attendance_date' => $date,
                'worked_seconds' => $workedSeconds,
                'overtime_seconds' => $overtimeSeconds,
                'extra_seconds' => $extraSeconds,
            ]
        );

        $this->auditLogService->log(
            action: 'attendance.time_edit_requested',
            actor: $currentUser,
            target: $created,
            metadata: [
                'attendance_date' => $date,
                'extra_minutes' => (int) $request->extra_minutes,
                'worked_seconds' => $workedSeconds,
                'overtime_seconds' => $overtimeSeconds,
            ],
            request: $request
        );

        return response()->json([
            'message' => 'Time edit request submitted.',
            'data' => $created->load(['user:id,name,email,role', 'reviewer:id,name,email']),
        ], 201);
    }

    public function approve(Request $request, int $id)
    {
        $request->validate([
            'review_note' => 'nullable|string|max:2000',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id || !$this->canManage($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $item = AttendanceTimeEditRequest::where('organization_id', $currentUser->organization_id)->find($id);
        if (!$item) {
            return response()->json(['message' => 'Time edit request not found'], 404);
        }
        if ($item->status !== 'pending') {
            return response()->json(['message' => 'Only pending requests can be approved.'], 422);
        }

        $item->update([
            'status' => 'approved',
            'reviewed_by' => $currentUser->id,
            'reviewed_at' => now(),
            'review_note' => $request->review_note,
        ]);

        $record = AttendanceRecord::firstOrNew([
            'user_id' => $item->user_id,
            'attendance_date' => Carbon::parse($item->attendance_date)->toDateString(),
        ]);
        $record->organization_id = $item->organization_id;
        $record->manual_adjustment_seconds = (int) ($record->manual_adjustment_seconds ?? 0) + (int) $item->extra_seconds;
        $record->save();

        $this->auditLogService->log(
            action: 'attendance.time_edit_approved',
            actor: $currentUser,
            target: $item,
            metadata: [
                'employee_id' => $item->user_id,
                'attendance_date' => $item->attendance_date,
                'extra_seconds' => (int) $item->extra_seconds,
            ],
            request: $request
        );

        return response()->json([
            'message' => 'Time edit request approved and applied.',
            'data' => $item->fresh()->load(['user:id,name,email,role', 'reviewer:id,name,email']),
        ]);
    }

    public function reject(Request $request, int $id)
    {
        $request->validate([
            'review_note' => 'nullable|string|max:2000',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id || !$this->canManage($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $item = AttendanceTimeEditRequest::where('organization_id', $currentUser->organization_id)->find($id);
        if (!$item) {
            return response()->json(['message' => 'Time edit request not found'], 404);
        }
        if ($item->status !== 'pending') {
            return response()->json(['message' => 'Only pending requests can be rejected.'], 422);
        }

        $item->update([
            'status' => 'rejected',
            'reviewed_by' => $currentUser->id,
            'reviewed_at' => now(),
            'review_note' => $request->review_note,
        ]);

        $this->auditLogService->log(
            action: 'attendance.time_edit_rejected',
            actor: $currentUser,
            target: $item,
            metadata: [
                'employee_id' => $item->user_id,
                'attendance_date' => $item->attendance_date,
                'extra_seconds' => (int) $item->extra_seconds,
            ],
            request: $request
        );

        return response()->json([
            'message' => 'Time edit request rejected.',
            'data' => $item->fresh()->load(['user:id,name,email,role', 'reviewer:id,name,email']),
        ]);
    }

    private function canManage(User $user): bool
    {
        return in_array($user->role, ['admin', 'manager'], true);
    }

    private function shiftTargetSeconds(): int
    {
        return max(1, (int) env('ATTENDANCE_SHIFT_SECONDS', 8 * 3600));
    }

    private function formatDuration(int $seconds): string
    {
        $hours = intdiv(max(0, $seconds), 3600);
        $minutes = intdiv(max(0, $seconds) % 3600, 60);

        return sprintf('%dh %02dm', $hours, $minutes);
    }
}
