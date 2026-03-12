<?php

namespace App\Http\Requests\Api\Chat;

use App\Http\Requests\Api\ApiFormRequest;

class StartConversationRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'email' => 'required|email',
        ];
    }
}
