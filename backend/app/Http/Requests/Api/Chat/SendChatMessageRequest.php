<?php

namespace App\Http\Requests\Api\Chat;

use App\Http\Requests\Api\ApiFormRequest;

class SendChatMessageRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'body' => 'nullable|string|max:4000',
            'attachment' => 'nullable|file|max:10240',
        ];
    }
}
