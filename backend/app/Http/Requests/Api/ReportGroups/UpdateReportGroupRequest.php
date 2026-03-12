<?php

namespace App\Http\Requests\Api\ReportGroups;

use App\Http\Requests\Api\ApiFormRequest;

class UpdateReportGroupRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:100',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'integer',
        ];
    }
}
