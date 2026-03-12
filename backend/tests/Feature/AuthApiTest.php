<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_returns_token_and_logout_revokes_it(): void
    {
        $organization = Organization::create([
            'name' => 'CareVance',
            'slug' => 'carevance',
        ]);

        $user = User::create([
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'organization_id' => $organization->id,
        ]);

        $loginResponse = $this->postJson('/api/auth/login', [
            'email' => 'admin@example.com',
            'password' => 'password123',
        ]);

        $loginResponse
            ->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonStructure(['token', 'user', 'organization']);

        $token = (string) $loginResponse->json('token');
        $this->assertNotSame('', $token);

        $this->getJson('/api/auth/me', [
            'Authorization' => 'Bearer '.$token,
            'Accept' => 'application/json',
        ])->assertOk()->assertJsonPath('id', $user->id);

        $this->postJson('/api/auth/logout', [], [
            'Authorization' => 'Bearer '.$token,
            'Accept' => 'application/json',
        ])->assertOk();

        $this->assertDatabaseMissing('personal_access_tokens', [
            'token' => hash('sha256', $token),
        ]);

        $this->getJson('/api/auth/me', [
            'Authorization' => 'Bearer '.$token,
            'Accept' => 'application/json',
        ])->assertUnauthorized();
    }

    public function test_protected_routes_require_a_valid_bearer_token(): void
    {
        $this->getJson('/api/settings/me')->assertUnauthorized();
        $this->getJson('/api/dashboard')->assertUnauthorized();

        DB::table('personal_access_tokens')->insert([
            'tokenable_type' => User::class,
            'tokenable_id' => 9999,
            'name' => 'bad-token',
            'token' => hash('sha256', 'invalid-token'),
            'abilities' => json_encode(['*']),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->getJson('/api/settings/me', [
            'Authorization' => 'Bearer invalid-token',
            'Accept' => 'application/json',
        ])->assertUnauthorized();
    }

    public function test_login_is_rate_limited_per_email_and_ip(): void
    {
        $organization = Organization::create([
            'name' => 'CareVance',
            'slug' => 'carevance',
        ]);

        User::create([
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'organization_id' => $organization->id,
        ]);

        foreach (range(1, 5) as $attempt) {
            $this->postJson('/api/auth/login', [
                'email' => 'admin@example.com',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $this->postJson('/api/auth/login', [
            'email' => 'admin@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(429);
    }
}
