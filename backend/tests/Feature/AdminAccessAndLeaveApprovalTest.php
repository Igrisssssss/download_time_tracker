<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\LeaveRequest;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminAccessAndLeaveApprovalTest extends TestCase
{
    use RefreshDatabase;

    public function test_leave_request_approval_marks_leave_and_updates_attendance(): void
    {
        $organization = Organization::create(['name' => 'Org', 'slug' => 'org']);
        $admin = User::create([
            'name' => 'Admin',
            'email' => 'admin@org.test',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'organization_id' => $organization->id,
        ]);
        $employee = User::create([
            'name' => 'Employee',
            'email' => 'employee@org.test',
            'password' => Hash::make('password123'),
            'role' => 'employee',
            'organization_id' => $organization->id,
        ]);

        $employeeHeaders = $this->apiHeadersFor($employee);
        $adminHeaders = $this->apiHeadersFor($admin);
        $date = now()->addDay()->toDateString();

        $createResponse = $this->postJson('/api/leave-requests', [
            'start_date' => $date,
            'end_date' => $date,
            'reason' => 'Doctor appointment',
        ], $employeeHeaders)->assertCreated();

        $leaveId = (int) $createResponse->json('data.id');

        $this->patchJson("/api/leave-requests/{$leaveId}/approve", [], $adminHeaders)
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $leave = LeaveRequest::findOrFail($leaveId);
        $attendance = AttendanceRecord::where('user_id', $employee->id)
            ->whereDate('attendance_date', $date)
            ->first();

        $this->assertSame('approved', $leave->status);
        $this->assertNotNull($attendance);
        $this->assertSame('absent', $attendance->status);
    }

    public function test_employee_is_forbidden_from_admin_reports_and_org_settings_but_admin_is_allowed(): void
    {
        $organization = Organization::create(['name' => 'Org', 'slug' => 'org']);
        $admin = User::create([
            'name' => 'Admin',
            'email' => 'admin2@org.test',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'organization_id' => $organization->id,
        ]);
        $employee = User::create([
            'name' => 'Employee',
            'email' => 'employee2@org.test',
            'password' => Hash::make('password123'),
            'role' => 'employee',
            'organization_id' => $organization->id,
        ]);

        $this->getJson('/api/reports/overall', $this->apiHeadersFor($employee))->assertForbidden();
        $this->putJson('/api/settings/organization', [
            'name' => 'Changed Org',
            'slug' => 'changed-org',
        ], $this->apiHeadersFor($employee))->assertForbidden();

        $this->getJson('/api/reports/overall', $this->apiHeadersFor($admin))->assertOk();
        $this->putJson('/api/settings/organization', [
            'name' => 'Changed Org',
            'slug' => 'changed-org',
        ], $this->apiHeadersFor($admin))
            ->assertOk()
            ->assertJsonPath('organization.name', 'Changed Org');
    }
}
