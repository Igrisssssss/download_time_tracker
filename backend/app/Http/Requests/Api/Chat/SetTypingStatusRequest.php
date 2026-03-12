<?php

namespace App\Http\Requests\Api\Chat;

use App\Http\Requests\Api\ApiFormRequest;

class SetTypingStatusRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'is_typing' => 'required|boolean',
        ];
    }
}
