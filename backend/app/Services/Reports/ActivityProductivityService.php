<?php

namespace App\Services\Reports;

class ActivityProductivityService
{
    public function guessToolType(string $activityType): string
    {
        $type = strtolower(trim($activityType));

        return $type === 'url' ? 'website' : 'software';
    }

    public function normalizeToolLabel(string $name, string $activityType): string
    {
        $trimmed = trim($name);

        if ($trimmed === '') {
            return $this->guessToolType($activityType) === 'website' ? 'unknown-site' : 'unknown-app';
        }

        if (strtolower(trim($activityType)) === 'url') {
            if (filter_var($trimmed, FILTER_VALIDATE_URL)) {
                $host = (string) parse_url($trimmed, PHP_URL_HOST);
                if ($host !== '') {
                    return strtolower((string) preg_replace('/^www\./', '', $host));
                }
            }

            if (preg_match('/([a-z0-9-]+\.)+[a-z]{2,}/i', $trimmed, $matches)) {
                return strtolower((string) preg_replace('/^www\./', '', $matches[0]));
            }
        }

        // Keep full app/window string so classifier can match terms like "YouTube" in "Chrome - YouTube".
        return mb_substr($trimmed, 0, 120);
    }

    public function classifyProductivity(string $toolLabel, string $activityType): string
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

        if ($isUnproductive && ! $isProductive) {
            return 'unproductive';
        }

        if ($isProductive && ! $isUnproductive) {
            return 'productive';
        }

        if (strtolower(trim($activityType)) === 'idle') {
            return 'neutral';
        }

        if (in_array(strtolower(trim($activityType)), ['url', 'app'], true)) {
            return 'productive';
        }

        return 'neutral';
    }

    public function buildToolBreakdown(iterable $activities): array
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

            if (! isset($rows[$key])) {
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
}
