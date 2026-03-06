<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendancePunch;
use App\Models\AttendanceRecord;
use App\Models\LeaveRequest;
use App\Models\TimeEntry;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;

class AttendanceController extends Controller
{
    public function today(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->organization_id) {
            return response()->json([
                'record' => null,
                'has_approved_leave_today' => false,
            ]);
        }

        $today = now()->toDateString();
        $record = AttendanceRecord::where('user_id', $user->id)
            ->where('attendance_date', $today)
            ->with('punches')
            ->first();
        $hasApprovedLeaveToday = $this->hasApprovedLeaveOnDate($user, $today);

        return response()->json([
            'record' => $this->decorateRecord($record),
            'late_after' => env('ATTENDANCE_LATE_AFTER', '09:30:00'),
            'shift_target_seconds' => $this->shiftTargetSeconds(),
            'has_approved_leave_today' => $hasApprovedLeaveToday,
        ]);
    }

    public function checkIn(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->organization_id) {
            return response()->json(['message' => 'Organization is required.'], 422);
        }

        $today = now()->toDateString();
        if ($this->hasApprovedLeaveOnDate($user, $today)) {
            return response()->json(['message' => 'You are on approved leave today. Punch in is blocked.'], 422);
        }

        $record = AttendanceRecord::firstOrNew([
            'user_id' => $user->id,
            'attendance_date' => $today,
        ]);

        if ($record->exists && $record->status === 'absent' && $this->hasApprovedLeaveOnDate($user, $today)) {
            return response()->json(['message' => 'You are on approved leave today. Punch in is blocked.'], 422);
        }

        $openPunch = AttendancePunch::where('user_id', $user->id)
            ->whereHas('attendanceRecord', function ($query) use ($today) {
                $query->whereDate('attendance_date', $today);
            })
            ->whereNull('punch_out_at')
            ->first();
        if ($openPunch) {
            return response()->json(['message' => 'You are already checked in for today'], 422);
        }

        $checkInAt = now();
        $lateThreshold = Carbon::parse($today.' '.env('ATTENDANCE_LATE_AFTER', '09:30:00'));
        $lateMinutes = max(0, $lateThreshold->diffInMinutes($checkInAt, false));

        $record->organization_id = $user->organization_id;
        $record->status = 'present';
        if (!$record->check_in_at) {
            $record->check_in_at = $checkInAt;
            $record->late_minutes = (int) $lateMinutes;
        }
        $record->save();

        AttendancePunch::create([
            'organization_id' => $user->organization_id,
            'user_id' => $user->id,
            'attendance_record_id' => $record->id,
            'punch_in_at' => $checkInAt,
        ]);

        $runningPrimary = TimeEntry::where('user_id', $user->id)
            ->where('timer_slot', 'primary')
            ->whereNull('end_time')
            ->exists();
        if (!$runningPrimary) {
            TimeEntry::create([
                'user_id' => $user->id,
                'project_id' => null,
                'task_id' => null,
                'description' => 'Auto timer started from punch in',
                'start_time' => $checkInAt,
                'timer_slot' => 'primary',
            ]);
        }

        return response()->json([
            'message' => 'Punched in successfully',
            'record' => $this->decorateRecord($record->fresh('punches')),
        ]);
    }

    public function checkOut(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->organization_id) {
            return response()->json(['message' => 'Organization is required.'], 422);
        }

        $today = now()->toDateString();
        $record = AttendanceRecord::where('user_id', $user->id)
            ->where('attendance_date', $today)
            ->with('punches')
            ->first();

        if (!$record || !$record->check_in_at) {
            return response()->json(['message' => 'Please check in first'], 422);
        }
        $openPunch = $record->punches->first(fn ($p) => !$p->punch_out_at);
        if (!$openPunch) {
            return response()->json(['message' => 'No active punch-in found.'], 422);
        }

        $checkOutAt = now();
        $sessionWorkedSeconds = max(0, Carbon::parse($openPunch->punch_in_at)->diffInSeconds($checkOutAt));
        $openPunch->update([
            'punch_out_at' => $checkOutAt,
            'worked_seconds' => (int) $sessionWorkedSeconds,
        ]);

        $record = $record->fresh('punches');
        $workedSeconds = $this->calculateClosedWorkedSeconds($record);

        $record->update([
            'check_out_at' => $checkOutAt,
            'worked_seconds' => (int) $workedSeconds,
            'status' => 'present',
        ]);

        $runningPrimary = TimeEntry::where('user_id', $user->id)
            ->where('timer_slot', 'primary')
            ->whereNull('end_time')
            ->orderByDesc('start_time')
            ->first();
        if ($runningPrimary) {
            $runningDuration = max(
                0,
                now()->getTimestamp() - Carbon::parse($runningPrimary->start_time)->getTimestamp()
            );
            $runningPrimary->update([
                'end_time' => now(),
                'duration' => (int) $runningDuration,
            ]);
        }

        return response()->json([
            'message' => 'Punched out successfully',
            'record' => $this->decorateRecord($record->fresh('punches')),
        ]);
    }

    public function calendar(Request $request)
    {
        $request->validate([
            'month' => ['nullable', 'regex:/^\d{4}\-\d{2}$/'],
            'user_id' => 'nullable|integer',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['days' => [], 'summary' => null]);
        }

        $month = $request->get('month', now()->format('Y-m'));
        $monthStart = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
        $monthEnd = $monthStart->copy()->endOfMonth();

        $targetUserId = $this->resolveTargetUserId($currentUser, $request);
        if (!$targetUserId) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $records = AttendanceRecord::where('organization_id', $currentUser->organization_id)
            ->where('user_id', $targetUserId)
            ->whereBetween('attendance_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->orderBy('attendance_date')
            ->with('punches')
            ->get()
            ->keyBy(fn (AttendanceRecord $r) => Carbon::parse($r->attendance_date)->toDateString());

        $days = [];
        $present = 0;
        $absent = 0;
        $weekend = 0;
        $late = 0;
        $totalWorked = 0;

        foreach (CarbonPeriod::create($monthStart, $monthEnd) as $date) {
            $dateStr = $date->toDateString();
            $isWeekend = $date->isWeekend();
            $record = $records->get($dateStr);

            if ($isWeekend && !$record) {
                $status = 'weekend';
                $weekend++;
            } elseif (!$record || !$record->check_in_at) {
                $status = 'absent';
                $absent++;
            } elseif ($record->check_in_at && !$record->check_out_at) {
                $status = 'checked_in';
                $present++;
                $totalWorked += $this->calculateEffectiveWorkedSeconds($record);
            } else {
                $status = 'present';
                $present++;
                $totalWorked += $this->calculateEffectiveWorkedSeconds($record);
            }

            if ($record && (int) $record->late_minutes > 0) {
                $late++;
            }

            $days[] = [
                'date' => $dateStr,
                'status' => $status,
                'is_weekend' => $isWeekend,
                'check_in_at' => $record?->check_in_at,
                'check_out_at' => $record?->check_out_at,
                'late_minutes' => (int) ($record?->late_minutes ?? 0),
                'worked_seconds' => $record ? $this->calculateEffectiveWorkedSeconds($record) : 0,
            ];
        }

        return response()->json([
            'month' => $month,
            'user_id' => $targetUserId,
            'days' => $days,
            'summary' => [
                'present_days' => $present,
                'absent_days' => $absent,
                'weekend_days' => $weekend,
                'late_days' => $late,
                'total_worked_seconds' => (int) $totalWorked,
            ],
        ]);
    }

    public function summary(Request $request)
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'q' => 'nullable|string|max:255',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['data' => []]);
        }

        $start = Carbon::parse($request->get('start_date', now()->startOfMonth()->toDateString()))->startOfDay();
        $end = Carbon::parse($request->get('end_date', now()->toDateString()))->endOfDay();
        if ($start->greaterThan($end)) {
            [$start, $end] = [$end->copy()->startOfDay(), $start->copy()->endOfDay()];
        }

        $usersQuery = User::where('organization_id', $currentUser->organization_id);
        if (!$this->canManage($currentUser)) {
            $usersQuery->where('id', $currentUser->id);
        } elseif ($request->filled('q')) {
            $term = trim((string) $request->q);
            $usersQuery->where(function ($q) use ($term) {
                $q->where('name', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%");
            });
        }

        $users = $usersQuery->orderBy('name')->get(['id', 'name', 'email', 'role']);
        $rows = $users->map(function (User $user) use ($currentUser, $start, $end) {
            $records = AttendanceRecord::where('organization_id', $currentUser->organization_id)
                ->where('user_id', $user->id)
                ->whereBetween('attendance_date', [$start->toDateString(), $end->toDateString()])
                ->with('punches')
                ->get();

            $presentDays = $records->whereNotNull('check_in_at')->count();
            $lateDays = $records->filter(fn ($r) => (int) $r->late_minutes > 0)->count();
            $totalWorkedSeconds = (int) $records->sum(fn (AttendanceRecord $r) => $this->calculateEffectiveWorkedSeconds($r));
            $checkedInToday = $records->first(fn (AttendanceRecord $r) => $this->hasOpenPunch($r) && Carbon::parse($r->attendance_date)->isToday());

            return [
                'user' => $user,
                'present_days' => $presentDays,
                'late_days' => $lateDays,
                'total_worked_seconds' => $totalWorkedSeconds,
                'is_checked_in' => (bool) $checkedInToday,
            ];
        })->values();

        return response()->json([
            'start_date' => $start->toDateString(),
            'end_date' => $end->toDateString(),
            'data' => $rows,
        ]);
    }

    private function resolveTargetUserId(User $currentUser, Request $request): ?int
    {
        if ($this->canManage($currentUser)) {
            if ($request->filled('user_id')) {
                $target = User::where('organization_id', $currentUser->organization_id)
                    ->where('id', (int) $request->user_id)
                    ->first();
                return $target?->id;
            }
            return $currentUser->id;
        }

        return $currentUser->id;
    }

    private function canManage(User $user): bool
    {
        return in_array($user->role, ['admin', 'manager'], true);
    }

    private function decorateRecord(?AttendanceRecord $record): ?array
    {
        if (!$record) {
            return null;
        }

        if (!$record->relationLoaded('punches')) {
            $record->load('punches');
        }

        $worked = $this->calculateEffectiveWorkedSeconds($record);
        $breakSeconds = $this->calculateBreakSeconds($record);
        $target = $this->shiftTargetSeconds();
        $remaining = max(0, $target - $worked);

        return [
            'id' => $record->id,
            'attendance_date' => Carbon::parse($record->attendance_date)->toDateString(),
            'check_in_at' => $record->check_in_at,
            'check_out_at' => $record->check_out_at,
            'worked_seconds' => $worked,
            'manual_adjustment_seconds' => (int) ($record->manual_adjustment_seconds ?? 0),
            'late_minutes' => (int) $record->late_minutes,
            'status' => $record->status,
            'is_checked_in' => $this->hasOpenPunch($record),
            'total_break_seconds' => $breakSeconds,
            'shift_target_seconds' => $target,
            'remaining_shift_seconds' => $remaining,
            'completed_shift' => $worked >= $target,
            'punches' => $record->punches->map(function (AttendancePunch $punch) {
                return [
                    'id' => $punch->id,
                    'punch_in_at' => $punch->punch_in_at,
                    'punch_out_at' => $punch->punch_out_at,
                    'worked_seconds' => (int) $punch->worked_seconds,
                ];
            })->values(),
        ];
    }

    private function shiftTargetSeconds(): int
    {
        return max(1, (int) env('ATTENDANCE_SHIFT_SECONDS', 8 * 3600));
    }

    private function hasApprovedLeaveOnDate(User $user, string $date): bool
    {
        return LeaveRequest::where('organization_id', $user->organization_id)
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->exists();
    }

    private function calculateClosedWorkedSeconds(AttendanceRecord $record): int
    {
        if (!$record->relationLoaded('punches')) {
            $record->load('punches');
        }

        return (int) $record->punches
            ->filter(fn (AttendancePunch $punch) => (bool) $punch->punch_out_at)
            ->sum(fn (AttendancePunch $punch) => max(
                (int) $punch->worked_seconds,
                (int) Carbon::parse($punch->punch_in_at)->diffInSeconds(Carbon::parse($punch->punch_out_at))
            ));
    }

    private function calculateEffectiveWorkedSeconds(AttendanceRecord $record): int
    {
        if (!$record->relationLoaded('punches')) {
            $record->load('punches');
        }

        $closed = $this->calculateClosedWorkedSeconds($record);
        $open = 0;
        $openPunch = $record->punches->first(fn (AttendancePunch $punch) => !$punch->punch_out_at);
        if ($openPunch) {
            $open = max(0, Carbon::parse($openPunch->punch_in_at)->diffInSeconds(now()));
        }

        $baseWorked = (int) max($record->worked_seconds ?? 0, $closed + $open);
        $adjustment = (int) ($record->manual_adjustment_seconds ?? 0);

        return (int) max(0, $baseWorked + $adjustment);
    }

    private function calculateBreakSeconds(AttendanceRecord $record): int
    {
        if (!$record->relationLoaded('punches')) {
            $record->load('punches');
        }

        $ordered = $record->punches->sortBy('punch_in_at')->values();
        $breakSeconds = 0;

        for ($i = 1; $i < $ordered->count(); $i++) {
            $previous = $ordered[$i - 1];
            $current = $ordered[$i];

            if (!$previous->punch_out_at || !$current->punch_in_at) {
                continue;
            }

            $gap = Carbon::parse($previous->punch_out_at)->diffInSeconds(Carbon::parse($current->punch_in_at), false);
            if ($gap > 0) {
                $breakSeconds += $gap;
            }
        }

        return (int) $breakSeconds;
    }

    private function hasOpenPunch(AttendanceRecord $record): bool
    {
        if (!$record->relationLoaded('punches')) {
            $record->load('punches');
        }

        return $record->punches->contains(fn (AttendancePunch $punch) => !$punch->punch_out_at);
    }
}
