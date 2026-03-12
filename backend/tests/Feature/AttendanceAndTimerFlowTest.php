<?php

namespace Tests\Feature;

use App\Models\AttendancePunch;
use App\Models\AttendanceRecord;
use App\Models\Organization;
use App\Models\TimeEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AttendanceAndTimerFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_check_in_creates_attendance_record_and_open_punch(): void
    {
        $organization = Organization::create(['name' => 'Org', 'slug' => 'org']);
        $user = User::create([
            'name' => 'Employee',
            'email' => 'employee@example.com',
            'password' => Hash::make('password123'),
            'role' => 'employee',
            'organization_id' => $organization->id,
        ]);

        $headers = $this->apiHeadersFor($user);

        $this->postJson('/api/attendance/check-in', [], $headers)->assertOk();

        $record = AttendanceRecord::firstOrFail();
        $this->assertNotNull($record->check_in_at);
        $this->assertDatabaseHas('attendance_punches', [
            'attendance_record_id' => $record->id,
            'user_id' => $user->id,
            'punch_out_at' => null,
        ]);
    }

    public function test_check_out_closes_an_active_attendance_punch(): void
    {
        $organization = Organization::create(['name' => 'Org', 'slug' => 'org']);
        $user = User::create([
            'name' => 'Employee',
            'email' => 'employee@example.com',
            'password' => Hash::make('password123'),
            'role' => 'employee',
            'organization_id' => $organization->id,
        ]);

        $headers = $this->apiHeadersFor($user);

        $this->postJson('/api/attendance/check-in', [], $headers)->assertOk();

        $this->postJson('/api/attendance/check-out', [], $headers)
            ->assertOk()
            ->assertJsonPath('message', 'Punched out successfully');

        $record = AttendanceRecord::firstOrFail();
        $record->refresh();
        $this->assertNotNull($record->check_out_at);
        $this->assertGreaterThanOrEqual(0, (int) $record->worked_seconds);
        $this->assertDatabaseMissing('attendance_punches', [
            'attendance_record_id' => $record->id,
            'punch_out_at' => null,
        ]);
    }

    public function test_timer_start_and_stop_manage_primary_time_entry_and_attendance(): void
    {
        $organization = Organization::create(['name' => 'Org', 'slug' => 'org']);
        $user = User::create([
            'name' => 'Employee',
            'email' => 'timer@example.com',
            'password' => Hash::make('password123'),
            'role' => 'employee',
            'organization_id' => $organization->id,
        ]);

        $headers = $this->apiHeadersFor($user);

        $startResponse = $this->postJson('/api/time-entries/start', [
            'description' => 'Primary timer',
            'timer_slot' => 'primary',
        ], $headers);

        $startResponse
            ->assertCreated()
            ->assertJsonPath('user_id', $user->id)
            ->assertJsonPath('timer_slot', 'primary');

        $entry = TimeEntry::firstOrFail();
        $this->assertNull($entry->end_time);

        $attendance = AttendanceRecord::firstOrFail();
        $this->assertSame('present', $attendance->status);
        $this->assertSame(1, AttendancePunch::where('attendance_record_id', $attendance->id)->whereNull('punch_out_at')->count());

        $this->postJson('/api/time-entries/stop', [
            'timer_slot' => 'primary',
        ], $headers)
            ->assertOk()
            ->assertJsonPath('id', $entry->id);

        $entry->refresh();
        $attendance->refresh();

        $this->assertNotNull($entry->end_time);
        $this->assertGreaterThanOrEqual(0, (int) $entry->duration);
        $this->assertNotNull($attendance->check_out_at);
        $this->assertDatabaseMissing('time_entries', [
            'id' => $entry->id,
            'end_time' => null,
        ]);
    }
}
