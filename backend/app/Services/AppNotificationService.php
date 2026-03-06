<?php

namespace App\Services;

use App\Models\AppNotification;
use Illuminate\Support\Collection;

class AppNotificationService
{
    /**
     * @param Collection<int, int> $userIds
     */
    public function sendToUsers(
        int $organizationId,
        Collection $userIds,
        ?int $senderId,
        string $type,
        string $title,
        string $message,
        ?array $meta = null
    ): void {
        $rows = $userIds
            ->unique()
            ->filter(fn ($id) => (int) $id > 0)
            ->map(function ($userId) use ($organizationId, $senderId, $type, $title, $message, $meta) {
                return [
                    'organization_id' => $organizationId,
                    'user_id' => (int) $userId,
                    'sender_id' => $senderId,
                    'type' => $type,
                    'title' => $title,
                    'message' => $message,
                    // insert() bypasses Eloquent casts, so JSON must be encoded explicitly.
                    'meta' => $meta ? json_encode($meta) : null,
                    'is_read' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            })
            ->values()
            ->all();

        if (!empty($rows)) {
            AppNotification::insert($rows);
        }
    }
}
