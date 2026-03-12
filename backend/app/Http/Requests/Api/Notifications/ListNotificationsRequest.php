<?php

namespace App\Http\Requests\Api\Notifications;

use App\Http\Requests\Api\ApiFormRequest;

class ListNotificationsRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'limit' => 'nullable|integer|min:1|max:100',
            'type' => 'nullable|string|max:50',
            'q' => 'nullable|string|max:255',
            'unread_only' => 'nullable|boolean',
        ];
    }
}
