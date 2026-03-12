<?php

namespace App\Http\Requests\Api\Attendance;

use App\Http\Requests\Api\ApiFormRequest;

class AttendanceSummaryRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'q' => 'nullable|string|max:255',
        ];
    }
}
