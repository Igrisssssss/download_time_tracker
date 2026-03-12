<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithApiResponses;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\Auth\LoginRequest;
use App\Http\Requests\Api\Auth\RegisterRequest;
use App\Models\Organization;
use App\Models\User;
use App\Services\Audit\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    use InteractsWithApiResponses;

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function register(RegisterRequest $request)
    {
        $result = DB::transaction(function () use ($request) {
            $role = $request->get('role', 'admin');
            $organization = null;
            $organizationName = trim((string) $request->organization_name);

            if ($role === 'employee') {
                if ($organizationName === '') {
                    throw ValidationException::withMessages([
                        'organization_name' => ['Organization name is required for employee signup.'],
                    ]);
                }

                $organization = Organization::query()
                    ->whereRaw('LOWER(name) = ?', [mb_strtolower($organizationName)])
                    ->orWhere('slug', Str::slug($organizationName))
                    ->first();

                if (!$organization) {
                    throw ValidationException::withMessages([
                        'organization_name' => ['Organization not found. Enter a valid organization name.'],
                    ]);
                }
            } else {
                if ($organizationName === '') {
                    throw ValidationException::withMessages([
                        'organization_name' => ['Organization name is required for admin signup.'],
                    ]);
                }

                $baseSlug = Str::slug($organizationName);
                $slug = $baseSlug !== '' ? $baseSlug : 'organization';
                $suffix = 1;

                while (Organization::where('slug', $slug)->exists()) {
                    $slug = ($baseSlug !== '' ? $baseSlug : 'organization').'-'.$suffix;
                    $suffix++;
                }

                $organization = Organization::create([
                    'name' => $organizationName,
                    'slug' => $slug,
                ]);
            }

            $user = User::create([
                'name' => $request->name,
                'email' => $request->email,
                'password' => Hash::make($request->password),
                'role' => $role,
                'organization_id' => $organization->id,
            ]);

            $token = $this->issueToken($user);

            return compact('user', 'token', 'organization');
        });

        return $this->createdResponse([
            'user' => $result['user'],
            'token' => $result['token'],
            'organization' => $result['organization'],
        ], 'Registered successfully.');
    }

    public function login(LoginRequest $request)
    {
        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $token = $this->issueToken($user);

        $this->auditLogService->log(
            action: 'auth.login',
            actor: $user,
            target: $user,
            metadata: [
                'role' => $user->role,
            ],
            request: $request
        );

        return $this->successResponse([
            'user' => $user,
            'token' => $token,
            'organization' => $user->organization,
        ], 'Logged in successfully.');
    }

    public function user(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'error_code' => 'UNAUTHORIZED',
            ], 401);
        }

        $user->load('organization');

        return $this->successResponse($user->toArray());
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        $tokenRecord = $request->attributes->get('access_token');

        if ($tokenRecord && isset($tokenRecord->id)) {
            DB::table('personal_access_tokens')->where('id', $tokenRecord->id)->delete();
        } else {
            $header = (string) $request->header('Authorization', '');
            if (preg_match('/Bearer\s+(.+)/i', $header, $matches)) {
                $plainToken = trim($matches[1]);
                if ($plainToken !== '') {
                    DB::table('personal_access_tokens')
                        ->where('token', hash('sha256', $plainToken))
                        ->delete();
                }
            }
        }

        if ($user) {
            $this->auditLogService->log(
                action: 'auth.logout',
                actor: $user,
                target: $user,
                metadata: [
                    'token_id' => $tokenRecord->id ?? null,
                ],
                request: $request
            );
        }

        return $this->successResponse([], 'Logged out successfully');
    }

    public function handoff(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'error_code' => 'UNAUTHORIZED',
            ], 401);
        }

        $token = $this->issueToken($user, 'web-handoff-token');
        $user->load('organization');

        return $this->successResponse([
            'user' => $user,
            'token' => $token,
            'organization' => $user->organization,
        ], 'Handoff token issued.');
    }

    private function issueToken(User $user, string $name = 'auth-token'): string
    {
        $plainToken = bin2hex(random_bytes(40));
        $ttlMinutes = (int) config('auth.api_tokens.ttl_minutes', 10080);

        DB::table('personal_access_tokens')->insert([
            'tokenable_type' => User::class,
            'tokenable_id' => $user->id,
            'name' => $name,
            'token' => hash('sha256', $plainToken),
            'abilities' => json_encode(['*']),
            'last_used_at' => null,
            'expires_at' => $ttlMinutes > 0 ? now()->addMinutes($ttlMinutes) : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $plainToken;
    }
}
