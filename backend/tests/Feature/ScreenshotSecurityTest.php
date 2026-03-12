<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Screenshot;
use App\Models\TimeEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ScreenshotSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_screenshot_paths_are_signed_and_files_are_not_written_to_public_disk(): void
    {
        Storage::fake('screenshots');
        Storage::fake('public');

        $organization = Organization::create([
            'name' => 'CareVance',
            'slug' => 'carevance',
        ]);

        $user = User::create([
            'name' => 'Employee User',
            'email' => 'employee@example.com',
            'password' => 'password123',
            'role' => 'employee',
            'organization_id' => $organization->id,
        ]);

        $timeEntry = TimeEntry::create([
            'user_id' => $user->id,
            'start_time' => now()->subHour(),
            'end_time' => now(),
            'duration' => 3600,
            'billable' => true,
        ]);

        $response = $this->post('/api/screenshots', [
            'time_entry_id' => $timeEntry->id,
            'image' => UploadedFile::fake()->create('capture.png', 64, 'image/png'),
        ], $this->apiHeadersFor($user));

        $response->assertCreated();

        $screenshot = Screenshot::query()->latest('id')->firstOrFail();
        $signedUrl = (string) $response->json('path');

        Storage::disk('screenshots')->assertExists($screenshot->filename);
        Storage::disk('public')->assertMissing('screenshots/'.$screenshot->filename);
        $this->assertStringContainsString('/api/screenshots/'.$screenshot->id.'/file', $signedUrl);
        $this->assertStringContainsString('signature=', $signedUrl);

        $this->get($signedUrl)->assertOk();
    }
}
