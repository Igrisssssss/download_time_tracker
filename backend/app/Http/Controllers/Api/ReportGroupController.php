<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithApiResponses;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\ReportGroups\StoreReportGroupRequest;
use App\Http\Requests\Api\ReportGroups\UpdateReportGroupRequest;
use App\Models\ReportGroup;
use App\Models\User;
use Illuminate\Http\Request;

class ReportGroupController extends Controller
{
    use InteractsWithApiResponses;

    public function index(Request $request)
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['data' => []]);
        }
        if (!$this->canManage($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $groups = ReportGroup::with(['users:id,name,email,role'])
            ->where('organization_id', $currentUser->organization_id)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $groups]);
    }

    public function store(StoreReportGroupRequest $request)
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Organization is required'], 422);
        }
        if (!$this->canManage($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $group = ReportGroup::create([
            'organization_id' => $currentUser->organization_id,
            'name' => trim((string) $request->name),
        ]);

        $userIds = $this->resolveOrgUserIds($currentUser->organization_id, $request->input('user_ids', []));
        $group->users()->sync($userIds);

        return $this->createdResponse($group->load(['users:id,name,email,role'])->toArray(), 'Group created.');
    }

    public function update(UpdateReportGroupRequest $request, int $id)
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Organization is required'], 422);
        }
        if (!$this->canManage($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $group = ReportGroup::where('organization_id', $currentUser->organization_id)->find($id);
        if (!$group) {
            return response()->json(['message' => 'Group not found'], 404);
        }

        if ($request->filled('name')) {
            $group->name = trim((string) $request->name);
            $group->save();
        }

        if ($request->has('user_ids')) {
            $userIds = $this->resolveOrgUserIds($currentUser->organization_id, $request->input('user_ids', []));
            $group->users()->sync($userIds);
        }

        return $this->updatedResponse($group->fresh()->load(['users:id,name,email,role'])->toArray(), 'Group updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $currentUser = $request->user();
        if (!$currentUser || !$currentUser->organization_id) {
            return response()->json(['message' => 'Organization is required'], 422);
        }
        if (!$this->canManage($currentUser)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $group = ReportGroup::where('organization_id', $currentUser->organization_id)->find($id);
        if (!$group) {
            return response()->json(['message' => 'Group not found'], 404);
        }

        $group->delete();

        return $this->deletedResponse('Group deleted');
    }

    private function canManage(User $user): bool
    {
        return in_array($user->role, ['admin', 'manager'], true);
    }

    private function resolveOrgUserIds(int $organizationId, array $ids): array
    {
        $cleanIds = collect($ids)->map(fn ($id) => (int) $id)->filter(fn ($id) => $id > 0)->unique()->values();

        if ($cleanIds->isEmpty()) {
            return [];
        }

        return User::where('organization_id', $organizationId)
            ->whereIn('id', $cleanIds)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }
}
