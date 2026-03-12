<?php

namespace Tests;

use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function issueApiToken(User $user, string $name = 'test-token'): string
    {
        $plainToken = bin2hex(random_bytes(40));

        DB::table('personal_access_tokens')->insert([
            'tokenable_type' => User::class,
            'tokenable_id' => $user->id,
            'name' => $name,
            'token' => hash('sha256', $plainToken),
            'abilities' => json_encode(['*']),
            'last_used_at' => null,
            'expires_at' => config('auth.api_tokens.ttl_minutes') > 0
                ? now()->addMinutes((int) config('auth.api_tokens.ttl_minutes'))
                : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $plainToken;
    }

    protected function apiHeadersFor(User $user): array
    {
        return [
            'Authorization' => 'Bearer '.$this->issueApiToken($user),
            'Accept' => 'application/json',
        ];
    }
}
