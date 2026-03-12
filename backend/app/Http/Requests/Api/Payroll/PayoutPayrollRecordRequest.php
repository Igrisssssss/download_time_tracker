<?php

namespace App\Http\Requests\Api\Payroll;

use App\Http\Requests\Api\ApiFormRequest;

class PayoutPayrollRecordRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'payout_method' => 'nullable|in:mock,stripe',
            'simulate_status' => 'nullable|in:success,failed,pending',
        ];
    }
}
