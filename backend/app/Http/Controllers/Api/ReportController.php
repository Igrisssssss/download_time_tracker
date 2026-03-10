<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\AttendanceRecord;
use App\Models\LeaveRequest;
use App\Models\Project;
use App\Models\ReportGroup;
use App\Models\Screenshot;
use App\Models\TimeEntry;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    private function canViewAll(?User $user): bool
    {
        return $user && in_array($user->role, ['admin', 'manager'], true);
    }

    public function dashboard(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $now = now();
        $todayStart = $now->copy()->startOfDay();
        $todayEnd = $now->copy()->endOfDay();
        $yesterdayStart = $now->copy()->subDay()->startOfDay();
        $yesterdayEnd = $now->copy()->subDay()->endOfDay();
        $weekStart = $now->copy()->startOfWeek();
        $weekEnd = $now->copy()->endOfWeek();

        $todayEntries = TimeEntry::with('project', 'task')
            ->where('user_id', $user->id)
            ->whereBetween('start_time', [$todayStart, $todayEnd])
            ->orderBy('start_time', 'desc')
            ->get();

        $activeEntry = TimeEntry::with('project', 'task')
            ->where('user_id', $user->id)
            ->where('timer_slot', 'primary')
            ->whereNull('end_time')
            ->orderByDesc('start_time')
            ->first();

        $activeDuration = 0;
        if ($activeEntry) {
            $activeDuration = max(
                0,
                now()->getTimestamp() - Carbon::parse($activeEntry->start_time)->getTimestamp()
            );
            $activeEntry->duration = (int) $activeDuration;
        }

        $todayDuration = (int) $todayEntries->sum('duration');
        $todayElapsedDuration = $todayDuration + (int) $activeDuration;
        $allTimeDuration = (int) TimeEntry::where('user_id', $user->id)->sum('duration');
        $allTimeElapsedDuration = $allTimeDuration + (int) $activeDuration;

        $yesterdayDuration = (int) TimeEntry::where('user_id', $user->id)
            ->whereBetween('start_time', [$yesterdayStart, $yesterdayEnd])
            ->sum('duration');

        $todayChangePercent = null;
        if ($yesterdayDuration > 0) {
            $todayChangePercent = (int) round((($todayElapsedDuration - $yesterdayDuration) / $yesterdayDuration) * 100);
        }

        $teamMembersCount = 0;
        $newMembersThisWeek = 0;
        $activeProjectsCount = 0;
        $totalProjectsCount = 0;

        if ($user->organization_id) {
            $teamMembersCount = User::where('organization_id', $user->organization_id)->count();
            $newMembersThisWeek = User::where('organization_id', $user->organization_id)
                ->where('created_at', '>=', $weekStart)
                ->count();

            $activeProjectsCount = Project::where('organization_id', $user->organization_id)
                ->where('status', 'active')
                ->count();
            $totalProjectsCount = Project::where('organization_id', $user->organization_id)->count();
        }

        $weekEntries = TimeEntry::where('user_id', $user->id)
            ->whereBetween('start_time', [$weekStart, $weekEnd])
            ->get(['duration', 'billable']);
        $weekTotal = (int) $weekEntries->sum('duration');
        $weekBillable = (int) $weekEntries->where('billable', true)->sum('duration');
        $productivityScore = $weekTotal > 0 ? (int) round(($weekBillable / $weekTotal) * 100) : 0;

        return response()->json([
            'active_timer' => $activeEntry,
            'today_entries' => $todayEntries,
            'today_total_duration' => $todayDuration,
            'today_total_elapsed_duration' => $todayElapsedDuration,
            'all_time_total_duration' => $allTimeDuration,
            'all_time_total_elapsed_duration' => $allTimeElapsedDuration,
            'yesterday_total_duration' => $yesterdayDuration,
            'today_change_percent' => $todayChangePercent,
            'active_projects_count' => $activeProjectsCount,
            'total_projects_count' => $totalProjectsCount,
            'team_members_count' => $teamMembersCount,
            'new_members_this_week' => $newMembersThisWeek,
            'productivity_score' => $productivityScore,
        ]);
    }

    public function daily(Request $request)
    {
        $date = $request->get('date', Carbon::today()->toDateString());
        $scope = $request->get('scope', 'self');

        $user = $request->user();
        if (!$user) {
            return response()->json($this->emptyReport(['date' => $date]));
        }

        $query = TimeEntry::with('project', 'task', 'user')
            ->whereDate('start_time', $date)
            ->orderBy('start_time', 'desc');

        if ($this->canViewAll($user) && $scope === 'organization' && $user->organization_id) {
            $orgUserIds = User::where('organization_id', $user->organization_id)->pluck('id');
            $query->whereIn('user_id', $orgUserIds);
        } else {
            $query->where('user_id', $user->id);
        }

        $timeEntries = $query->get();

        return response()->json(array_merge(
            ['date' => $date],
            $this->buildCommonReportPayload($timeEntries)
        ));
    }

    public function weekly(Request $request)
    {
        $scope = $request->get('scope', 'self');
        $startDate = Carbon::parse($request->get('start_date', Carbon::now()->startOfWeek()->toDateString()))->startOfDay();
        $endDate = Carbon::parse($request->get('end_date', Carbon::now()->endOfWeek()->toDateString()))->endOfDay();

        $user = $request->user();
        if (!$user) {
            return response()->json($this->emptyReport([
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
            ]));
        }

        $query = TimeEntry::with('project', 'task', 'user')
            ->whereBetween('start_time', [$startDate, $endDate])
            ->orderBy('start_time', 'desc');

        if ($this->canViewAll($user) && $scope === 'organization' && $user->organization_id) {
            $orgUserIds = User::where('organization_id', $user->organization_id)->pluck('id');
            $query->whereIn('user_id', $orgUserIds);
        } else {
            $query->where('user_id', $user->id);
        }

        $timeEntries = $query->get();

        return response()->json(array_merge(
            [
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
            ],
            $this->buildCommonReportPayload($timeEntries)
        ));
    }

    public function monthly(Request $request)
    {
        $scope = $request->get('scope', 'self');
        $startDate = $request->get('start_date');
        $endDate = $request->get('end_date');

        if (!$startDate || !$endDate) {
            $date = Carbon::now();
            $startDate = $date->copy()->startOfMonth()->toDateString();
            $endDate = $date->copy()->endOfMonth()->toDateString();
        }
        $startDate = Carbon::parse($startDate)->startOfDay();
        $endDate = Carbon::parse($endDate)->endOfDay();

        $user = $request->user();
        if (!$user) {
            return response()->json($this->emptyReport([
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
            ]));
        }

        $query = TimeEntry::with('project', 'task', 'user')
            ->whereBetween('start_time', [$startDate, $endDate])
            ->orderBy('start_time', 'desc');

        if ($this->canViewAll($user) && $scope === 'organization' && $user->organization_id) {
            $orgUserIds = User::where('organization_id', $user->organization_id)->pluck('id');
            $query->whereIn('user_id', $orgUserIds);
        } else {
            $query->where('user_id', $user->id);
        }

        $timeEntries = $query->get();

        $byDay = $timeEntries->groupBy(function ($entry) {
            return Carbon::parse($entry->start_time)->toDateString();
        })->map(function ($entries) {
            return [
                'date' => Carbon::parse($entries->first()->start_time)->toDateString(),
                'total_time' => (int) $entries->sum('duration'),
            ];
        })->values();

        return response()->json(array_merge(
            [
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'by_day' => $byDay,
            ],
            $this->buildCommonReportPayload($timeEntries)
        ));
    }

    public function productivity(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['productivity_score' => 0, 'idle_time' => 0, 'active_time' => 0]);
        }

        $startDate = $request->get('start_date', Carbon::now()->startOfWeek()->toDateString());
        $endDate = $request->get('end_date', Carbon::now()->endOfWeek()->toDateString());

        $entries = TimeEntry::where('user_id', $user->id)
            ->whereBetween('start_time', [$startDate, $endDate])
            ->get();

        $total = (int) $entries->sum('duration');
        $billable = (int) $entries->where('billable', true)->sum('duration');
        $score = $total > 0 ? (int) round(($billable / $total) * 100) : 0;

        return response()->json([
            'start_date' => $startDate,
            'end_date' => $endDate,
            'productivity_score' => $score,
            'active_time' => $billable,
            'idle_time' => max($total - $billable, 0),
        ]);
    }

    public function team(Request $request)
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['by_user' => []]);
        }

        $startDate = $request->get('start_date', Carbon::now()->startOfWeek()->toDateString());
        $endDate = $request->get('end_date', Carbon::now()->endOfWeek()->toDateString());

        $users = User::where('organization_id', $currentUser->organization_id)->get();
        $byUser = $users->map(function (User $user) use ($startDate, $endDate) {
            $entries = TimeEntry::where('user_id', $user->id)
                ->whereBetween('start_time', [$startDate, $endDate])
                ->get();

            return [
                'user' => $user,
                'total_time' => (int) $entries->sum('duration'),
                'entries' => $entries,
            ];
        });

        return response()->json([
            'start_date' => $startDate,
            'end_date' => $endDate,
            'by_user' => $byUser,
        ]);
    }

    public function overall(Request $request)
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'integer',
            'group_ids' => 'nullable|array',
            'group_ids.*' => 'integer',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $startDate = Carbon::parse($request->get('start_date', Carbon::now()->startOfMonth()->toDateString()))->startOfDay();
        $endDate = Carbon::parse($request->get('end_date', Carbon::now()->toDateString()))->endOfDay();
        if ($startDate->greaterThan($endDate)) {
            [$startDate, $endDate] = [$endDate->copy()->startOfDay(), $startDate->copy()->endOfDay()];
        }

        $selectedIds = collect($request->input('user_ids', []))
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();
        $selectedGroupIds = collect($request->input('group_ids', []))
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        $usersQuery = User::where('organization_id', $currentUser->organization_id);
        if (!$this->canViewAll($currentUser)) {
            $usersQuery->where('id', $currentUser->id);
        } else {
            if ($selectedGroupIds->isNotEmpty()) {
                $groupUserIds = ReportGroup::where('organization_id', $currentUser->organization_id)
                    ->whereIn('id', $selectedGroupIds)
                    ->with('users:id')
                    ->get()
                    ->flatMap(fn (ReportGroup $group) => $group->users->pluck('id'))
                    ->map(fn ($id) => (int) $id)
                    ->unique()
                    ->values();

                if ($groupUserIds->isEmpty()) {
                    return response()->json([
                        'start_date' => $startDate->toDateString(),
                        'end_date' => $endDate->toDateString(),
                        'summary' => [
                            'users_count' => 0,
                            'active_users' => 0,
                            'total_duration' => 0,
                            'billable_duration' => 0,
                            'non_billable_duration' => 0,
                            'idle_duration' => 0,
                        ],
                        'by_user' => [],
                        'by_day' => [],
                    ]);
                }

                $usersQuery->whereIn('id', $groupUserIds);
            }

            if ($selectedIds->isNotEmpty()) {
                $usersQuery->whereIn('id', $selectedIds);
            }
        }
        $users = $usersQuery->orderBy('name')->get(['id', 'name', 'email', 'role']);
        if ($users->isEmpty()) {
            return response()->json([
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'summary' => [
                    'users_count' => 0,
                    'active_users' => 0,
                    'total_duration' => 0,
                    'billable_duration' => 0,
                    'non_billable_duration' => 0,
                    'idle_duration' => 0,
                ],
                'by_user' => [],
                'by_day' => [],
            ]);
        }

        $userIds = $users->pluck('id');

        $entries = TimeEntry::whereIn('user_id', $userIds)
            ->whereBetween('start_time', [$startDate, $endDate])
            ->get(['user_id', 'duration', 'billable', 'start_time']);

        $activities = Activity::whereIn('user_id', $userIds)
            ->whereBetween('recorded_at', [$startDate, $endDate])
            ->get(['user_id', 'type', 'duration', 'recorded_at']);

        $activeUserIds = TimeEntry::whereIn('user_id', $userIds)
            ->whereNull('end_time')
            ->distinct()
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id);

        $entriesByUser = $entries->groupBy('user_id');
        $activitiesByUser = $activities->groupBy('user_id');

        $byUser = $users->map(function ($user) use ($entriesByUser, $activitiesByUser, $activeUserIds) {
            $userEntries = $entriesByUser->get($user->id, collect());
            $userActivities = $activitiesByUser->get($user->id, collect());
            $totalDuration = (int) $userEntries->sum('duration');
            $billableDuration = (int) $userEntries->where('billable', true)->sum('duration');
            $idleDuration = (int) $userActivities->where('type', 'idle')->sum('duration');
            $lastActivityAt = $userActivities->max('recorded_at');

            return [
                'user' => $user,
                'entries_count' => $userEntries->count(),
                'total_duration' => $totalDuration,
                'billable_duration' => $billableDuration,
                'non_billable_duration' => max($totalDuration - $billableDuration, 0),
                'idle_duration' => $idleDuration,
                'idle_percentage' => $totalDuration > 0 ? (float) round(($idleDuration / $totalDuration) * 100, 2) : 0,
                'last_activity_at' => $lastActivityAt,
                'is_working' => $activeUserIds->contains((int) $user->id),
            ];
        })->values();

        $byDay = $entries->groupBy(fn ($entry) => Carbon::parse($entry->start_time)->toDateString())
            ->map(function ($group, $date) {
                return [
                    'date' => $date,
                    'total_duration' => (int) $group->sum('duration'),
                    'billable_duration' => (int) $group->where('billable', true)->sum('duration'),
                ];
            })
            ->sortBy('date')
            ->values();

        $totalDuration = (int) $entries->sum('duration');
        $billableDuration = (int) $entries->where('billable', true)->sum('duration');
        $idleDuration = (int) $activities->where('type', 'idle')->sum('duration');

        return response()->json([
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'summary' => [
                'users_count' => $users->count(),
                'active_users' => $activeUserIds->unique()->count(),
                'total_duration' => $totalDuration,
                'billable_duration' => $billableDuration,
                'non_billable_duration' => max($totalDuration - $billableDuration, 0),
                'idle_duration' => $idleDuration,
                'idle_percentage' => $totalDuration > 0 ? (float) round(($idleDuration / $totalDuration) * 100, 2) : 0,
            ],
            'users' => $users,
            'by_user' => $byUser,
            'by_day' => $byDay,
        ]);
    }

    public function project(Request $request, int $projectId)
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $project = Project::where('organization_id', $currentUser->organization_id)->find($projectId);
        if (!$project) {
            return response()->json(['message' => 'Project not found'], 404);
        }

        $startDate = $request->get('start_date', Carbon::now()->startOfMonth()->toDateString());
        $endDate = $request->get('end_date', Carbon::now()->endOfMonth()->toDateString());

        $entries = TimeEntry::with('user', 'task')
            ->where('project_id', $project->id)
            ->whereBetween('start_time', [$startDate, $endDate])
            ->get();

        return response()->json([
            'project' => $project,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'entries' => $entries,
            'total_time' => (int) $entries->sum('duration'),
            'billable_time' => (int) $entries->where('billable', true)->sum('duration'),
        ]);
    }

    public function export(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $startDate = $request->get('start_date', Carbon::now()->startOfMonth()->toDateString());
        $endDate = $request->get('end_date', Carbon::now()->endOfMonth()->toDateString());

        $entries = TimeEntry::with('project', 'task')
            ->where('user_id', $user->id)
            ->whereBetween('start_time', [$startDate, $endDate])
            ->orderBy('start_time')
            ->get();

        $lines = [
            'Date,Project,Task,Description,Duration (seconds),Billable',
        ];

        foreach ($entries as $entry) {
            $lines[] = implode(',', [
                Carbon::parse($entry->start_time)->toDateString(),
                $this->csvValue($entry->project?->name ?? 'No Project'),
                $this->csvValue($entry->task?->title ?? ''),
                $this->csvValue($entry->description ?? ''),
                $entry->duration,
                $entry->billable ? 'Yes' : 'No',
            ]);
        }

        $csv = implode("\n", $lines);
        $fileName = 'report-'.$startDate.'-to-'.$endDate.'.csv';

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="'.$fileName.'"',
        ]);
    }

    public function attendance(Request $request)
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'user_id' => 'nullable|integer',
            'q' => 'nullable|string|max:255',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['data' => []]);
        }

        $startDate = Carbon::parse($request->get('start_date', now()->startOfYear()->toDateString()))->startOfDay();
        $endDate = Carbon::parse($request->get('end_date', now()->endOfYear()->toDateString()))->endOfDay();
        if ($startDate->greaterThan($endDate)) {
            [$startDate, $endDate] = [$endDate->copy()->startOfDay(), $startDate->copy()->endOfDay()];
        }

        $allDatesInRange = collect(CarbonPeriod::create($startDate->copy()->startOfDay(), $endDate->copy()->startOfDay()))
            ->map(fn (Carbon $date) => $date->toDateString());
        $weekendDates = $allDatesInRange
            ->filter(fn (string $date) => Carbon::parse($date)->isWeekend())
            ->values();
        $workingDates = $allDatesInRange
            ->reject(fn (string $date) => Carbon::parse($date)->isWeekend())
            ->values();

        $usersQuery = User::where('organization_id', $currentUser->organization_id);
        if (!$this->canViewAll($currentUser)) {
            $usersQuery->where('id', $currentUser->id);
        } else {
            if ($request->filled('user_id')) {
                $usersQuery->where('id', (int) $request->user_id);
            }
            if ($request->filled('q')) {
                $term = trim((string) $request->q);
                $usersQuery->where(function ($query) use ($term) {
                    $query->where('name', 'like', "%{$term}%")
                        ->orWhere('email', 'like', "%{$term}%");
                });
            }
        }

        $users = $usersQuery->orderBy('name')->get();
        $workingDaysCount = max(1, $workingDates->count());

        $rows = $users->map(function (User $user) use ($startDate, $endDate, $workingDaysCount, $workingDates, $weekendDates, $currentUser) {
            $records = AttendanceRecord::query()
                ->where('organization_id', $currentUser->organization_id)
                ->where('user_id', $user->id)
                ->whereBetween('attendance_date', [$startDate->toDateString(), $endDate->toDateString()])
                ->get(['attendance_date', 'check_in_at', 'check_out_at', 'worked_seconds', 'manual_adjustment_seconds']);

            $recordByDate = $records->keyBy(fn ($record) => Carbon::parse($record->attendance_date)->toDateString());
            $presentDates = $workingDates
                ->filter(fn (string $date) => (bool) $recordByDate->get($date)?->check_in_at)
                ->values();

            $approvedLeaveDates = LeaveRequest::query()
                ->where('organization_id', $currentUser->organization_id)
                ->where('user_id', $user->id)
                ->where('status', 'approved')
                ->whereDate('start_date', '<=', $endDate->toDateString())
                ->whereDate('end_date', '>=', $startDate->toDateString())
                ->get(['start_date', 'end_date'])
                ->flatMap(function ($leave) {
                    return collect(CarbonPeriod::create($leave->start_date, $leave->end_date))
                        ->filter(fn ($date) => !$date->isWeekend())
                        ->map(fn ($date) => $date->toDateString())
                        ->values();
                })
                ->unique()
                ->values();

            $absentDates = $workingDates
                ->filter(fn (string $date) => !$presentDates->contains($date))
                ->values();

            $workedSeconds = (int) $records->sum(function ($record) {
                return (int) ($record->worked_seconds ?? 0) + (int) ($record->manual_adjustment_seconds ?? 0);
            });
            $daysPresent = $presentDates->count();
            $leaveDays = $approvedLeaveDates->count();
            $attendanceRate = (float) round(($daysPresent / $workingDaysCount) * 100, 2);

            $isWorking = AttendanceRecord::where('organization_id', $currentUser->organization_id)
                ->where('user_id', $user->id)
                ->whereDate('attendance_date', now()->toDateString())
                ->whereNotNull('check_in_at')
                ->whereNull('check_out_at')
                ->exists();

            return [
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                ],
                'days_present' => $daysPresent,
                'working_days_in_range' => $workingDaysCount,
                'leave_days' => $leaveDays,
                'attendance_rate' => $attendanceRate,
                'worked_seconds' => $workedSeconds,
                'worked_hours' => round($workedSeconds / 3600, 2),
                'is_working' => $isWorking,
                'present_dates' => $presentDates,
                'leave_dates' => $approvedLeaveDates,
                'absent_dates' => $absentDates,
                'weekend_dates' => $weekendDates,
            ];
        })->values();

        return response()->json([
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'weekend_days' => $weekendDates->count(),
            'working_days' => $workingDates->count(),
            'data' => $rows,
        ]);
    }

    public function employeeInsights(Request $request)
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'user_id' => 'nullable|integer',
            'q' => 'nullable|string|max:255',
        ]);

        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['matched_users' => [], 'selected_user' => null]);
        }

        $startDate = Carbon::parse($request->get('start_date', now()->startOfMonth()->toDateString()))->startOfDay();
        $endDate = Carbon::parse($request->get('end_date', now()->toDateString()))->endOfDay();
        if ($startDate->greaterThan($endDate)) {
            [$startDate, $endDate] = [$endDate->copy()->startOfDay(), $startDate->copy()->endOfDay()];
        }

        $usersQuery = User::where('organization_id', $currentUser->organization_id);
        if (!$this->canViewAll($currentUser)) {
            $usersQuery->where('id', $currentUser->id);
        } else {
            if ($request->filled('q')) {
                $term = trim((string) $request->q);
                $usersQuery->where(function ($query) use ($term) {
                    $query->where('name', 'like', "%{$term}%")
                        ->orWhere('email', 'like', "%{$term}%");
                });
            }
        }

        $matchedUsers = (clone $usersQuery)->orderBy('name')->limit(20)->get(['id', 'name', 'email', 'role']);
        $analyticsUsers = (clone $usersQuery)->orderBy('name')->get(['id', 'name', 'email', 'role']);
        $selectedUserId = $request->filled('user_id')
            ? (int) $request->user_id
            : (int) ($matchedUsers->first()->id ?? 0);

        if ($selectedUserId <= 0) {
            return response()->json([
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'matched_users' => [],
                'selected_user' => null,
                'stats' => null,
                'activity_breakdown' => [],
                'recent_screenshots' => [],
            ]);
        }

        $selectedUser = User::where('organization_id', $currentUser->organization_id)
            ->where('id', $selectedUserId)
            ->first();
        if (!$selectedUser) {
            return response()->json(['message' => 'User not found'], 404);
        }
        if (!$this->canViewAll($currentUser) && $selectedUser->id !== $currentUser->id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $entries = TimeEntry::where('user_id', $selectedUser->id)
            ->whereBetween('start_time', [$startDate, $endDate])
            ->get(['duration', 'billable']);
        $totalDuration = (int) $entries->sum('duration');
        $billableDuration = (int) $entries->where('billable', true)->sum('duration');
        $entriesCount = $entries->count();

        $activities = Activity::where('user_id', $selectedUser->id)
            ->whereBetween('recorded_at', [$startDate, $endDate])
            ->get(['type', 'name', 'duration', 'recorded_at']);

        $totalIdle = (int) $activities->where('type', 'idle')->sum('duration');
        $idleCount = max(1, $activities->where('type', 'idle')->count());
        $avgIdle = (float) round($totalIdle / $idleCount, 2);

        $activityBreakdown = $activities->groupBy('type')->map(function ($group, $type) {
            return [
                'type' => $type,
                'count' => $group->count(),
                'total_duration' => (int) $group->sum('duration'),
            ];
        })->values();

        $recentScreenshots = Screenshot::query()
            ->whereHas('timeEntry', function ($query) use ($selectedUser, $startDate, $endDate) {
                $query->where('user_id', $selectedUser->id)
                    ->whereBetween('start_time', [$startDate, $endDate]);
            })
            ->orderByDesc('created_at')
            ->limit(60)
            ->get();

        $analyticsUserIds = $analyticsUsers->pluck('id')->map(fn ($id) => (int) $id)->filter(fn ($id) => $id > 0)->values();
        $organizationActivities = $analyticsUserIds->isEmpty()
            ? collect()
            : Activity::whereIn('user_id', $analyticsUserIds)
                ->whereBetween('recorded_at', [$startDate, $endDate])
                ->get(['user_id', 'type', 'name', 'duration']);

        $toolTotalsByKey = [];
        $perUserScore = [];

        foreach ($analyticsUsers as $analyticsUser) {
            $perUserScore[(int) $analyticsUser->id] = [
                'user' => [
                    'id' => (int) $analyticsUser->id,
                    'name' => $analyticsUser->name,
                    'email' => $analyticsUser->email,
                    'role' => $analyticsUser->role,
                ],
                'productive_duration' => 0,
                'unproductive_duration' => 0,
                'neutral_duration' => 0,
                'total_duration' => 0,
            ];
        }

        foreach ($organizationActivities as $item) {
            $duration = max(0, (int) ($item->duration ?? 0));
            if ($duration <= 0) {
                continue;
            }

            $label = $this->normalizeToolLabel((string) ($item->name ?? ''), (string) ($item->type ?? 'app'));
            $classification = $this->classifyProductivity($label, (string) ($item->type ?? 'app'));
            $toolType = $this->guessToolType((string) ($item->type ?? 'app'));
            $toolKey = strtolower($toolType.'|'.$label);

            if (!isset($toolTotalsByKey[$toolKey])) {
                $toolTotalsByKey[$toolKey] = [
                    'label' => $label,
                    'type' => $toolType,
                    'classification' => $classification,
                    'total_duration' => 0,
                    'total_events' => 0,
                    'users' => [],
                ];
            }

            $toolTotalsByKey[$toolKey]['total_duration'] += $duration;
            $toolTotalsByKey[$toolKey]['total_events'] += 1;
            $toolTotalsByKey[$toolKey]['users'][(int) $item->user_id] = true;

            if (!isset($perUserScore[(int) $item->user_id])) {
                $perUserScore[(int) $item->user_id] = [
                    'user' => ['id' => (int) $item->user_id, 'name' => 'Unknown', 'email' => '', 'role' => 'employee'],
                    'productive_duration' => 0,
                    'unproductive_duration' => 0,
                    'neutral_duration' => 0,
                    'total_duration' => 0,
                ];
            }

            $perUserScore[(int) $item->user_id]['total_duration'] += $duration;
            if ($classification === 'productive') {
                $perUserScore[(int) $item->user_id]['productive_duration'] += $duration;
            } elseif ($classification === 'unproductive') {
                $perUserScore[(int) $item->user_id]['unproductive_duration'] += $duration;
            } else {
                $perUserScore[(int) $item->user_id]['neutral_duration'] += $duration;
            }
        }

        $toolAnalytics = collect(array_values($toolTotalsByKey))->map(function (array $row) use ($analyticsUsers) {
            $usersCount = count($row['users']);
            $totalDuration = (int) $row['total_duration'];
            return [
                'label' => $row['label'],
                'type' => $row['type'],
                'classification' => $row['classification'],
                'total_duration' => $totalDuration,
                'total_events' => (int) $row['total_events'],
                'users_count' => $usersCount,
                'avg_duration_per_employee' => $analyticsUsers->count() > 0
                    ? (float) round($totalDuration / $analyticsUsers->count(), 2)
                    : 0.0,
            ];
        });

        $productiveTools = $toolAnalytics
            ->where('classification', 'productive')
            ->sortByDesc('total_duration')
            ->values();
        $unproductiveTools = $toolAnalytics
            ->where('classification', 'unproductive')
            ->sortByDesc('total_duration')
            ->values();

        $employeeScores = collect(array_values($perUserScore))
            ->filter(fn (array $row) => strtolower((string) ($row['user']['role'] ?? '')) === 'employee')
            ->map(function (array $row) {
                $total = max(1, (int) $row['total_duration']);
                $row['productive_share'] = (float) round(($row['productive_duration'] / $total) * 100, 2);
                $row['unproductive_share'] = (float) round(($row['unproductive_duration'] / $total) * 100, 2);
                return $row;
            })
            ->sortByDesc('productive_duration')
            ->values();

        $mostProductiveEmployee = $employeeScores
            ->sortByDesc('productive_duration')
            ->first(fn ($row) => (int) ($row['productive_duration'] ?? 0) > 0);
        $mostUnproductiveEmployee = $employeeScores
            ->sortByDesc('unproductive_duration')
            ->first(fn ($row) => (int) ($row['unproductive_duration'] ?? 0) > 0);

        $selectedToolBreakdown = $this->buildToolBreakdown($activities);
        $orgProductiveDuration = (int) $productiveTools->sum('total_duration');
        $orgUnproductiveDuration = (int) $unproductiveTools->sum('total_duration');
        $orgNeutralDuration = (int) $toolAnalytics->where('classification', 'neutral')->sum('total_duration');
        $orgTrackedDuration = max(1, $orgProductiveDuration + $orgUnproductiveDuration + $orgNeutralDuration);

        $activeTimeEntryUserIds = $analyticsUserIds->isEmpty()
            ? collect()
            : TimeEntry::whereIn('user_id', $analyticsUserIds)
                ->whereNull('end_time')
                ->pluck('user_id')
                ->map(fn ($id) => (int) $id)
                ->unique();

        $todayDate = now()->toDateString();
        $onLeaveUserIds = $analyticsUserIds->isEmpty()
            ? collect()
            : LeaveRequest::query()
                ->whereIn('user_id', $analyticsUserIds)
                ->where('status', 'approved')
                ->whereDate('start_date', '<=', $todayDate)
                ->whereDate('end_date', '>=', $todayDate)
                ->where(function ($query) {
                    $query->whereNull('revoke_status')
                        ->orWhere('revoke_status', '!=', 'approved');
                })
                ->pluck('user_id')
                ->map(fn ($id) => (int) $id)
                ->unique();

        $userScoreById = collect($perUserScore);
        $orgGroups = ReportGroup::with(['users:id,name,email,role'])
            ->where('organization_id', $currentUser->organization_id)
            ->orderBy('name')
            ->get();

        $teamEfficiency = $orgGroups->map(function (ReportGroup $group) use ($userScoreById, $activeTimeEntryUserIds, $onLeaveUserIds) {
            $memberIds = collect($group->users ?? [])
                ->filter(fn ($u) => strtolower((string) ($u->role ?? '')) === 'employee')
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->values();

            $memberScores = $memberIds
                ->map(fn ($id) => $userScoreById->get($id))
                ->filter()
                ->values();

            $productive = (int) $memberScores->sum(fn ($row) => (int) ($row['productive_duration'] ?? 0));
            $unproductive = (int) $memberScores->sum(fn ($row) => (int) ($row['unproductive_duration'] ?? 0));
            $neutral = (int) $memberScores->sum(fn ($row) => (int) ($row['neutral_duration'] ?? 0));
            $total = $productive + $unproductive + $neutral;
            $score = $total > 0 ? (float) round(($productive / $total) * 100, 2) : 0.0;

            return [
                'group' => [
                    'id' => (int) $group->id,
                    'name' => $group->name,
                ],
                'members_count' => $memberIds->count(),
                'active_members_count' => $memberIds->filter(fn ($id) => $activeTimeEntryUserIds->contains($id))->count(),
                'on_leave_members_count' => $memberIds->filter(fn ($id) => $onLeaveUserIds->contains($id))->count(),
                'productive_duration' => $productive,
                'unproductive_duration' => $unproductive,
                'neutral_duration' => $neutral,
                'total_duration' => $total,
                'efficiency_score' => $score,
            ];
        })->values();

        $teamEfficiencyRanked = $teamEfficiency
            ->sortByDesc('efficiency_score')
            ->values();

        $latestRecentActivities = $analyticsUserIds->isEmpty()
            ? collect()
            : Activity::whereIn('user_id', $analyticsUserIds)
                ->where('recorded_at', '>=', now()->subMinutes(5))
                ->orderByDesc('recorded_at')
                ->get(['user_id', 'type', 'name', 'duration', 'recorded_at'])
                ->groupBy('user_id')
                ->map(fn ($group) => $group->first());

        $liveMonitoringRows = $analyticsUsers->map(function ($user) use ($latestRecentActivities, $activeTimeEntryUserIds) {
            $latest = $latestRecentActivities->get((int) $user->id);
            $classification = 'neutral';
            $toolLabel = null;
            $toolType = null;
            $activityType = null;

            if ($latest) {
                $toolLabel = $this->normalizeToolLabel((string) ($latest->name ?? ''), (string) ($latest->type ?? 'app'));
                $classification = $this->classifyProductivity($toolLabel, (string) ($latest->type ?? 'app'));
                $toolType = $this->guessToolType((string) ($latest->type ?? 'app'));
                $activityType = (string) ($latest->type ?? 'app');
            }

            return [
                'user' => [
                    'id' => (int) $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                ],
                'is_working' => $activeTimeEntryUserIds->contains((int) $user->id),
                'current_tool' => $toolLabel,
                'tool_type' => $toolType,
                'activity_type' => $activityType,
                'classification' => $classification,
                'last_activity_at' => $latest ? Carbon::parse($latest->recorded_at)->toIso8601String() : null,
            ];
        })->values();

        $liveMonitoringRows = $liveMonitoringRows->map(function (array $row) use ($onLeaveUserIds) {
            $isOnLeave = $onLeaveUserIds->contains((int) ($row['user']['id'] ?? 0));
            $row['is_on_leave'] = $isOnLeave;
            $row['work_status'] = $isOnLeave
                ? 'on_leave'
                : ((bool) ($row['is_working'] ?? false) ? 'active' : 'inactive');
            return $row;
        })->values();

        $employeeLiveRows = $liveMonitoringRows
            ->filter(fn (array $row) => strtolower((string) ($row['user']['role'] ?? '')) === 'employee')
            ->values();

        $selectedUserLive = $liveMonitoringRows->first(fn ($row) => (int) ($row['user']['id'] ?? 0) === (int) $selectedUser->id);

        return response()->json([
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'matched_users' => $matchedUsers,
            'analytics_users_count' => $analyticsUsers->count(),
            'selected_user' => $selectedUser,
            'stats' => [
                'entries_count' => $entriesCount,
                'total_duration' => $totalDuration,
                'total_hours' => round($totalDuration / 3600, 2),
                'billable_duration' => $billableDuration,
                'idle_total_duration' => $totalIdle,
                'idle_avg_duration' => $avgIdle,
                'activity_events' => $activities->count(),
            ],
            'activity_breakdown' => $activityBreakdown,
            'selected_user_tools' => $selectedToolBreakdown,
            'organization_tools' => [
                'productive' => $productiveTools->take(10)->values(),
                'unproductive' => $unproductiveTools->take(10)->values(),
            ],
            'organization_summary' => [
                'productive_duration' => $orgProductiveDuration,
                'unproductive_duration' => $orgUnproductiveDuration,
                'neutral_duration' => $orgNeutralDuration,
                'productive_share' => (float) round(($orgProductiveDuration / $orgTrackedDuration) * 100, 2),
                'unproductive_share' => (float) round(($orgUnproductiveDuration / $orgTrackedDuration) * 100, 2),
            ],
            'employee_rankings' => [
                'most_productive' => $mostProductiveEmployee,
                'most_unproductive' => $mostUnproductiveEmployee,
                'by_productive_duration' => $employeeScores->sortByDesc('productive_duration')->values(),
                'by_unproductive_duration' => $employeeScores->sortByDesc('unproductive_duration')->values(),
            ],
            'team_rankings' => [
                'by_efficiency' => $teamEfficiencyRanked,
                'top_productive' => $teamEfficiencyRanked->first(),
                'least_productive' => $teamEfficiencyRanked->sortBy('efficiency_score')->first(),
            ],
            'live_monitoring' => [
                'selected_user' => $selectedUserLive,
                'working_now' => $liveMonitoringRows->where('is_working', true)->values(),
                'all_users' => $liveMonitoringRows,
                'employees_active' => $employeeLiveRows->where('work_status', 'active')->values(),
                'employees_inactive' => $employeeLiveRows->where('work_status', 'inactive')->values(),
                'employees_on_leave' => $employeeLiveRows->where('work_status', 'on_leave')->values(),
            ],
            'recent_screenshots' => $recentScreenshots,
        ]);
    }

    private function guessToolType(string $activityType): string
    {
        $type = strtolower(trim($activityType));
        return $type === 'url' ? 'website' : 'software';
    }

    private function normalizeToolLabel(string $name, string $activityType): string
    {
        $trimmed = trim($name);

        if ($trimmed === '') {
            return $this->guessToolType($activityType) === 'website' ? 'unknown-site' : 'unknown-app';
        }

        if (strtolower(trim($activityType)) === 'url') {
            if (filter_var($trimmed, FILTER_VALIDATE_URL)) {
                $host = (string) parse_url($trimmed, PHP_URL_HOST);
                if ($host !== '') {
                    return strtolower(preg_replace('/^www\./', '', $host));
                }
            }

            if (preg_match('/([a-z0-9-]+\.)+[a-z]{2,}/i', $trimmed, $matches)) {
                return strtolower(preg_replace('/^www\./', '', $matches[0]));
            }
        }

        // Keep full app/window string so classifier can match terms like "YouTube" in "Chrome - YouTube".
        return mb_substr($trimmed, 0, 120);
    }

    private function classifyProductivity(string $toolLabel, string $activityType): string
    {
        $text = strtolower($toolLabel);

        $productiveKeywords = [
            'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'notion', 'slack', 'teams', 'zoom',
            'vscode', 'visual studio', 'intellij', 'pycharm', 'webstorm', 'phpstorm', 'terminal',
            'powershell', 'cmd', 'postman', 'figma', 'miro', 'docs.google', 'sheets.google', 'drive.google',
            'stackoverflow', 'learn.microsoft', 'developer.mozilla', 'trello', 'asana', 'linear', 'clickup',
            'outlook', 'gmail', 'calendar.google', 'word', 'excel', 'powerpoint', 'meet.google',
            'chat.openai', 'chatgpt', 'claude.ai', 'gemini.google', 'code', 'cursor', 'android studio',
            'datagrip', 'dbeaver', 'tableplus', 'mysql workbench', 'navicat',
        ];

        $unproductiveKeywords = [
            'youtube', 'netflix', 'primevideo', 'hotstar', 'spotify', 'instagram', 'facebook', 'twitter',
            'x.com', 'reddit', 'snapchat', 'tiktok', 'discord', 'twitch', 'pinterest', '9gag',
            'telegram', 'whatsapp', 'web.whatsapp', 'wa.me', 'fb.com', 'reels', 'shorts', 'cricbuzz', 'espncricinfo',
        ];

        $isProductive = collect($productiveKeywords)->contains(fn ($keyword) => str_contains($text, $keyword));
        $isUnproductive = collect($unproductiveKeywords)->contains(fn ($keyword) => str_contains($text, $keyword));

        if ($isUnproductive && !$isProductive) {
            return 'unproductive';
        }
        if ($isProductive && !$isUnproductive) {
            return 'productive';
        }

        if (strtolower(trim($activityType)) === 'idle') {
            return 'neutral';
        }

        // Default non-idle activity to productive so monitored websites/software are visible
        // unless explicitly flagged as unproductive.
        if (in_array(strtolower(trim($activityType)), ['url', 'app'], true)) {
            return 'productive';
        }

        return 'neutral';
    }

    private function buildToolBreakdown($activities): array
    {
        $rows = [];

        foreach ($activities as $activity) {
            $duration = max(0, (int) ($activity->duration ?? 0));
            if ($duration <= 0) {
                continue;
            }

            $label = $this->normalizeToolLabel((string) ($activity->name ?? ''), (string) ($activity->type ?? 'app'));
            $classification = $this->classifyProductivity($label, (string) ($activity->type ?? 'app'));
            $type = $this->guessToolType((string) ($activity->type ?? 'app'));
            $key = strtolower($classification.'|'.$type.'|'.$label);

            if (!isset($rows[$key])) {
                $rows[$key] = [
                    'label' => $label,
                    'type' => $type,
                    'classification' => $classification,
                    'total_duration' => 0,
                    'total_events' => 0,
                ];
            }

            $rows[$key]['total_duration'] += $duration;
            $rows[$key]['total_events'] += 1;
        }

        $grouped = collect(array_values($rows))->sortByDesc('total_duration')->values();

        return [
            'productive' => $grouped->where('classification', 'productive')->values(),
            'unproductive' => $grouped->where('classification', 'unproductive')->values(),
            'neutral' => $grouped->where('classification', 'neutral')->values(),
        ];
    }

    private function buildCommonReportPayload($timeEntries): array
    {
        $enrichedEntries = $timeEntries->map(function ($entry) {
            $duration = (int) ($entry->duration ?? 0);
            if (!$entry->end_time && $entry->start_time) {
                $duration = max(
                    $duration,
                    now()->getTimestamp() - Carbon::parse($entry->start_time)->getTimestamp()
                );
            }
            $entry->effective_duration = (int) max(0, $duration);
            return $entry;
        });

        $totalDuration = (int) $enrichedEntries->sum('effective_duration');
        $billableDuration = (int) $enrichedEntries->where('billable', true)->sum('effective_duration');

        $byProject = $enrichedEntries->groupBy('project_id')->map(function ($entries) {
            return [
                'project' => $entries->first()->project,
                'total_time' => (int) $entries->sum('effective_duration'),
                'entries' => $entries->values(),
            ];
        })->values();

        $byUser = $enrichedEntries->groupBy('user_id')->map(function ($entries) {
            return [
                'user' => $entries->first()->user,
                'total_time' => (int) $entries->sum('effective_duration'),
                'entries' => $entries->values(),
            ];
        })->values();

        return [
            'entries' => $enrichedEntries,
            'time_entries' => $enrichedEntries,
            'total_time' => $totalDuration,
            'billable_time' => $billableDuration,
            'total_duration' => $totalDuration,
            'billable_duration' => $billableDuration,
            'total_hours' => round($totalDuration / 3600, 2),
            'billable_hours' => round($billableDuration / 3600, 2),
            'by_project' => $byProject,
            'by_user' => $byUser,
        ];
    }

    private function emptyReport(array $extra = []): array
    {
        return array_merge($extra, [
            'entries' => [],
            'time_entries' => [],
            'total_time' => 0,
            'billable_time' => 0,
            'total_duration' => 0,
            'billable_duration' => 0,
            'total_hours' => 0,
            'billable_hours' => 0,
            'by_project' => [],
            'by_user' => [],
        ]);
    }

    private function csvValue(string $value): string
    {
        $escaped = str_replace('"', '""', $value);
        return '"'.$escaped.'"';
    }
}
