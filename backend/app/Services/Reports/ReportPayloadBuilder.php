<?php

namespace App\Services\Reports;

use Carbon\Carbon;

class ReportPayloadBuilder
{
    public function buildCommonReportPayload($timeEntries): array
    {
        $enrichedEntries = $timeEntries->map(function ($entry) {
            $duration = (int) ($entry->duration ?? 0);
            if (! $entry->end_time && $entry->start_time) {
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

    public function emptyReport(array $extra = []): array
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
}
