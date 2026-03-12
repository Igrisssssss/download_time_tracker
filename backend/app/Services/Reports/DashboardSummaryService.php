<?php

namespace App\Services\Reports;

use App\Models\Project;
use App\Models\TimeEntry;
use App\Models\User;
use Carbon\Carbon;

class DashboardSummaryService
{
    public function build(User $user): array
    {
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
            ->where(function ($query) {
                $query->where('timer_slot', 'primary')
                    ->orWhereNull('timer_slot');
            })
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

        $todayEntries->transform(function (TimeEntry $entry) use ($now) {
            $entry->duration = $this->elapsedDuration($entry, $now);

            return $entry;
        });

        $todayDuration = (int) $todayEntries->sum(fn (TimeEntry $entry) => $this->storedDuration($entry));
        $todayElapsedDuration = (int) $todayEntries->sum(fn (TimeEntry $entry) => $this->elapsedDuration($entry, $now));
        $allEntries = TimeEntry::where('user_id', $user->id)->get(['id', 'start_time', 'end_time', 'duration', 'billable']);
        $allTimeDuration = (int) $allEntries->sum(fn (TimeEntry $entry) => $this->storedDuration($entry));
        $allTimeElapsedDuration = (int) $allEntries->sum(fn (TimeEntry $entry) => $this->elapsedDuration($entry, $now));

        $yesterdayDuration = (int) TimeEntry::where('user_id', $user->id)
            ->whereBetween('start_time', [$yesterdayStart, $yesterdayEnd])
            ->get(['id', 'start_time', 'end_time', 'duration'])
            ->sum(fn (TimeEntry $entry) => $this->elapsedDuration($entry, $now));

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
            ->get(['id', 'start_time', 'end_time', 'duration', 'billable']);
        $weekTotal = (int) $weekEntries->sum(fn (TimeEntry $entry) => $this->elapsedDuration($entry, $now));
        $weekBillable = (int) $weekEntries
            ->where('billable', true)
            ->sum(fn (TimeEntry $entry) => $this->elapsedDuration($entry, $now));
        $productivityScore = $weekTotal > 0 ? (int) round(($weekBillable / $weekTotal) * 100) : 0;

        return [
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
        ];
    }

    private function storedDuration(TimeEntry $entry): int
    {
        return (int) max(0, (int) ($entry->duration ?? 0));
    }

    private function elapsedDuration(TimeEntry $entry, Carbon $now): int
    {
        if ($entry->end_time) {
            return (int) max(
                $this->storedDuration($entry),
                Carbon::parse($entry->start_time)->diffInSeconds(Carbon::parse($entry->end_time))
            );
        }

        return (int) max(
            $this->storedDuration($entry),
            Carbon::parse($entry->start_time)->diffInSeconds($now)
        );
    }
}
