<?php

namespace App\Http\Requests\Api\Settings;

use App\Http\Requests\Api\ApiFormRequest;

class UpdatePreferencesRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'timezone' => 'nullable|string|max:64',
            'notifications' => 'nullable|array',
            'notifications.email' => 'nullable|boolean',
            'notifications.weekly_summary' => 'nullable|boolean',
            'notifications.project_updates' => 'nullable|boolean',
            'notifications.task_assignments' => 'nullable|boolean',
        ];
    }
}
