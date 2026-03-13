<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\TimeEntry;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ActivityController extends Controller
{
    private function canViewAll(?\App\Models\User $user): bool
    {
        return $user && in_array($user->role, ['admin', 'manager'], true);
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['data' => []]);
        }

        $canViewAll = $this->canViewAll($user);

        $activities = Activity::query()
            ->with(['user:id,name,email,role'])
            ->whereHas('user', function ($query) use ($user) {
                $query->where('organization_id', $user->organization_id);
            })
            ->when(!$canViewAll, fn ($query) => $query->where('user_id', $user->id))
            ->when($canViewAll && $request->user_id, fn ($query, $userId) => $query->where('user_id', $userId))
            ->when($request->type, function ($query, $type) {
                $query->where('type', $type);
            })
            ->when($request->start_date, function ($query, $startDate) {
                $query->where('recorded_at', '>=', Carbon::parse((string) $startDate)->startOfDay());
            })
            ->when($request->end_date, function ($query, $endDate) {
                $query->where('recorded_at', '<=', Carbon::parse((string) $endDate)->endOfDay());
            })
            ->orderBy('recorded_at', 'desc')
            ->paginate(15);

        return response()->json($activities);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'nullable|exists:users,id',
            'time_entry_id' => 'nullable|exists:time_entries,id',
            'type' => 'required|in:app,url,idle',
            'name' => 'required|string|max:255',
            'duration' => 'nullable|integer|min:0',
            'recorded_at' => 'nullable|date',
        ]);

        if ($request->user()) {
            // Employees can only submit their own telemetry.
            $validated['user_id'] = $request->user()->id;
        }

        if (!empty($validated['time_entry_id'])) {
            $timeEntryBelongsToUser = TimeEntry::whereKey($validated['time_entry_id'])
                ->where('user_id', $validated['user_id'])
                ->exists();

            if (!$timeEntryBelongsToUser) {
                return response()->json(['message' => 'Selected time entry is invalid for this user.'], 422);
            }
        }

        $validated['duration'] = $validated['duration'] ?? 0;
        $validated['recorded_at'] = $validated['recorded_at'] ?? now();

        $activity = Activity::create($validated);

        return response()->json($activity, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Activity $activity)
    {
        $requestUser = request()->user();
        if (!$requestUser) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($activity->user?->organization_id !== $requestUser->organization_id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if (!$this->canViewAll($requestUser) && $activity->user_id !== $requestUser->id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return response()->json($activity);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Activity $activity)
    {
        $requestUser = $request->user();
        if (!$requestUser) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($activity->user?->organization_id !== $requestUser->organization_id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if (!$this->canViewAll($requestUser) && $activity->user_id !== $requestUser->id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $validated = $request->validate([
            'time_entry_id' => 'nullable|exists:time_entries,id',
            'type' => 'sometimes|in:app,url,idle',
            'name' => 'sometimes|string|max:255',
            'duration' => 'nullable|integer|min:0',
            'recorded_at' => 'nullable|date',
        ]);

        if (array_key_exists('time_entry_id', $validated) && !empty($validated['time_entry_id'])) {
            $timeEntryBelongsToUser = TimeEntry::whereKey($validated['time_entry_id'])
                ->where('user_id', $activity->user_id)
                ->exists();

            if (!$timeEntryBelongsToUser) {
                return response()->json(['message' => 'Selected time entry is invalid for this user.'], 422);
            }
        }

        $activity->update($validated);

        return response()->json($activity);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Activity $activity)
    {
        $requestUser = request()->user();
        if (!$requestUser) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($activity->user?->organization_id !== $requestUser->organization_id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if (!$this->canViewAll($requestUser) && $activity->user_id !== $requestUser->id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $activity->delete();

        return response()->json(['message' => 'Activity deleted successfully']);
    }
}
