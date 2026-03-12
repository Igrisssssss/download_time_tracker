<?php

namespace App\Http\Requests\Api\ReportGroups;

use App\Http\Requests\Api\ApiFormRequest;

class StoreReportGroupRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'integer',
        ];
    }
}
