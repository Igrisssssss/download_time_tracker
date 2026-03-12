<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendancePunch;
use App\Models\AttendanceRecord;
use App\Models\LeaveRequest;
use App\Models\TimeEntry;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

class TimeEntryController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['data' => []]);
        }

        $timeEntries = TimeEntry::with('task', 'project')
            ->where('user_id', $user->id)
            ->when($request->timer_slot, fn (Builder $q, string $slot) => $q->where('timer_slot', $slot))
            ->when($request->project_id, fn (Builder $q, string $projectId) => $q->where('project_id', $projectId))
            ->when($request->task_id, fn (Builder $q, string $taskId) => $q->where('task_id', $taskId))
            ->when($request->start_date, fn (Builder $q, string $start) => $q->whereDate('start_time', '>=', $start))
            ->when($request->end_date, fn (Builder $q, string $end) => $q->whereDate('start_time', '<=', $end))
            ->orderBy('start_time', 'desc')
            ->paginate((int) $request->get('per_page', 15));

        return response()->json($timeEntries);
    }

    public function store(Request $request)
    {
        $request->validate([
            'description' => 'nullable|string',
            'project_id' => 'nullable|exists:projects,id',
            'task_id' => 'nullable|exists:tasks,id',
            'start_time' => 'required|date',
            'end_time' => 'nullable|date|after:start_time',
            'duration' => 'nullable|integer|min:0',
            'billable' => 'nullable|boolean',
            'timer_slot' => 'nullable|in:primary,secondary',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $timeEntry = TimeEntry::create([
            'description' => $request->description,
            'project_id' => $request->project_id,
            'task_id' => $request->task_id,
            'start_time' => $request->start_time,
            'end_time' => $request->end_time,
            'duration' => $request->duration ?? 0,
            'billable' => $request->billable ?? true,
            'user_id' => $user->id,
            'timer_slot' => $request->get('timer_slot', 'primary'),
        ]);

        return response()->json($timeEntry, 201);
    }

    public function show(TimeEntry $timeEntry)
    {
        if (!$this->canAccessTimeEntry($timeEntry)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $timeEntry->load('task', 'project');
        return response()->json($timeEntry);
    }

    public function update(Request $request, TimeEntry $timeEntry)
    {
        if (!$this->canAccessTimeEntry($timeEntry)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $request->validate([
            'description' => 'nullable|string',
            'project_id' => 'nullable|exists:projects,id',
            'task_id' => 'nullable|exists:tasks,id',
            'start_time' => 'nullable|date',
            'end_time' => 'nullable|date|after:start_time',
            'duration' => 'nullable|integer|min:0',
            'billable' => 'nullable|boolean',
            'timer_slot' => 'nullable|in:primary,secondary',
        ]);

        $timeEntry->update($request->only([
            'description', 'project_id', 'task_id', 
            'start_time', 'end_time', 'duration', 'billable', 'timer_slot'
        ]));

        return response()->json($timeEntry);
    }

    public function destroy(TimeEntry $timeEntry)
    {
        if (!$this->canAccessTimeEntry($timeEntry)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $timeEntry->delete();

        return response()->json(['message' => 'Time entry deleted']);
    }

    public function start(Request $request)
    {
        $request->validate([
            'description' => 'nullable|string',
            'project_id' => 'nullable|exists:projects,id',
            'task_id' => 'nullable|exists:tasks,id',
            'timer_slot' => 'nullable|in:primary,secondary',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $slot = $request->get('timer_slot', 'primary');

        if ($slot === 'primary') {
            $attendanceGuard = $this->ensureAttendanceCheckedIn($user);
            if ($attendanceGuard) {
                return $attendanceGuard;
            }
        }

        $startedAt = now();
        $runningEntries = $this->runningEntriesQuery((int) $user->id, $slot)
            ->orderByDesc('start_time')
            ->get();
        $this->closeRunningEntries($runningEntries, $startedAt);

        $timeEntry = TimeEntry::create([
            'description' => $request->description,
            'project_id' => $request->project_id,
            'task_id' => $request->task_id,
            'start_time' => $startedAt,
            'user_id' => $user->id,
            'timer_slot' => $slot,
        ]);

        return response()->json($timeEntry, 201);
    }

    public function stop(Request $request)
    {
        $request->validate([
            'timer_slot' => 'nullable|in:primary,secondary',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $slot = $request->get('timer_slot', 'primary');

        $runningEntries = $this->runningEntriesQuery((int) $user->id, $slot)
            ->orderByDesc('start_time')
            ->get();

        if ($runningEntries->isEmpty()) {
            return response()->json(['message' => 'No running timer found'], 404);
        }

        $stoppedAt = now();
        $this->closeRunningEntries($runningEntries, $stoppedAt);
        $timeEntry = $runningEntries->first();

        if ($slot === 'primary') {
            $this->ensureAttendanceCheckedOutForBreak($user->id, $stoppedAt);
        }

        return response()->json($timeEntry);
    }

    public function active(Request $request)
    {
        $request->validate([
            'timer_slot' => 'nullable|in:primary,secondary',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(null);
        }
        $slot = $request->get('timer_slot', 'primary');

        $timeEntry = $this->runningEntriesQuery((int) $user->id, $slot)
            ->with('task', 'project')
            ->orderByDesc('start_time')
            ->first();

        if ($timeEntry) {
            $durationSeconds = max(
                0,
                now()->getTimestamp() - Carbon::parse($timeEntry->start_time)->getTimestamp()
            );
            $timeEntry->duration = (int) $durationSeconds;
        }

        return response()->json($timeEntry);
    }

    public function today(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json([
                'time_entries' => [],
                'total_duration' => 0,
            ]);
        }

        $today = now()->startOfDay();

        $timeEntries = TimeEntry::with('task', 'project')
            ->where('user_id', $user->id)
            ->where('start_time', '>=', $today)
            ->orderBy('start_time', 'desc')
            ->get();

        $totalDuration = (int) $timeEntries->sum(fn (TimeEntry $entry) => $this->effectiveDuration($entry));

        return response()->json([
            'time_entries' => $timeEntries,
            'total_duration' => $totalDuration,
        ]);
    }

    private function canAccessTimeEntry(TimeEntry $timeEntry): bool
    {
        $user = request()->user();
        return $user && $timeEntry->user_id === $user->id;
    }

    private function ensureAttendanceCheckedIn($user)
    {
        $today = now()->toDateString();
        if ($this->hasApprovedLeaveOnDate((int) $user->organization_id, (int) $user->id, $today)) {
            return response()->json(['message' => 'You are on approved leave today. Timer cannot start.'], 422);
        }

        $record = AttendanceRecord::firstOrNew([
            'user_id' => $user->id,
            'attendance_date' => $today,
        ]);
        $record->organization_id = $user->organization_id;
        $record->status = 'present';

        $now = now();
        if (!$record->check_in_at) {
            $lateThreshold = Carbon::parse($today.' '.env('ATTENDANCE_LATE_AFTER', '09:30:00'));
            $record->check_in_at = $now;
            $record->late_minutes = $this->toLateMinutes($lateThreshold->diffInMinutes($now, false));
        }
        $record->save();

        $openPunch = AttendancePunch::where('attendance_record_id', $record->id)
            ->whereNull('punch_out_at')
            ->first();

        if (!$openPunch) {
            AttendancePunch::create([
                'organization_id' => $user->organization_id,
                'user_id' => $user->id,
                'attendance_record_id' => $record->id,
                'punch_in_at' => $now,
            ]);
        }

        return null;
    }

    private function ensureAttendanceCheckedOutForBreak(int $userId, ?Carbon $checkOutAt = null): void
    {
        $today = now()->toDateString();
        $record = AttendanceRecord::where('user_id', $userId)
            ->whereDate('attendance_date', $today)
            ->first();
        if (!$record) {
            return;
        }

        $openPunch = AttendancePunch::where('attendance_record_id', $record->id)
            ->whereNull('punch_out_at')
            ->orderByDesc('punch_in_at')
            ->first();
        if (!$openPunch) {
            return;
        }

        $checkOutAt = $checkOutAt ?: now();
        $sessionWorkedSeconds = max(0, Carbon::parse($openPunch->punch_in_at)->diffInSeconds($checkOutAt));
        $openPunch->update([
            'punch_out_at' => $checkOutAt,
            'worked_seconds' => (int) $sessionWorkedSeconds,
        ]);

        $closedWorked = (int) AttendancePunch::where('attendance_record_id', $record->id)
            ->whereNotNull('punch_out_at')
            ->sum('worked_seconds');

        $record->update([
            'check_out_at' => $checkOutAt,
            'worked_seconds' => $closedWorked,
            'status' => 'present',
        ]);
    }

    private function hasApprovedLeaveOnDate(int $organizationId, int $userId, string $date): bool
    {
        return LeaveRequest::where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->exists();
    }

    private function toLateMinutes(int|float $rawMinutes): int
    {
        return (int) max(0, floor($rawMinutes));
    }

    private function runningEntriesQuery(int $userId, string $slot): Builder
    {
        return TimeEntry::query()
            ->where('user_id', $userId)
            ->whereNull('end_time')
            ->where(function (Builder $query) use ($slot) {
                if ($slot === 'primary') {
                    $query->where('timer_slot', 'primary')
                        ->orWhereNull('timer_slot');

                    return;
                }

                $query->where('timer_slot', $slot);
            });
    }

    private function closeRunningEntries(Collection $runningEntries, Carbon $endedAt): void
    {
        foreach ($runningEntries as $running) {
            $running->update([
                'end_time' => $endedAt,
                'duration' => $this->effectiveDuration($running, $endedAt),
            ]);
        }
    }

    private function effectiveDuration(TimeEntry $entry, ?Carbon $endAt = null): int
    {
        if ($entry->end_time) {
            return (int) max(
                (int) ($entry->duration ?? 0),
                Carbon::parse($entry->start_time)->diffInSeconds(Carbon::parse($entry->end_time))
            );
        }

        $resolvedEnd = $endAt ?: now();

        return (int) max(
            (int) ($entry->duration ?? 0),
            Carbon::parse($entry->start_time)->diffInSeconds($resolvedEnd)
        );
    }
}
