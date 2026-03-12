<?php

namespace App\Http\Requests\Api\Attendance;

use App\Http\Requests\Api\ApiFormRequest;

class AttendanceCalendarRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'month' => ['nullable', 'regex:/^\d{4}\-\d{2}$/'],
            'user_id' => 'nullable|integer',
        ];
    }
}
