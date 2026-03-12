<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Screenshot;
use App\Models\TimeEntry;
use App\Models\User;
use App\Services\Audit\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ScreenshotController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    private function canViewAll(?User $user): bool
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

        $screenshots = Screenshot::query()
            ->whereHas('timeEntry.user', function ($query) use ($user) {
                $query->where('organization_id', $user->organization_id);
            })
            ->when(!$this->canViewAll($user), function ($query) use ($user) {
                $query->whereHas('timeEntry', function ($timeEntryQuery) use ($user) {
                    $timeEntryQuery->where('user_id', $user->id);
                });
            })
            ->when($this->canViewAll($user) && $request->user_id, function ($query, $userId) {
                $query->whereHas('timeEntry', function ($timeEntryQuery) use ($userId) {
                    $timeEntryQuery->where('user_id', $userId);
                });
            })
            ->when($request->time_entry_id, function ($query, $timeEntryId) {
                $query->where('time_entry_id', $timeEntryId);
            })
            ->orderBy('created_at', 'desc')
            ->paginate(15);

        return response()->json($screenshots);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'time_entry_id' => 'required|exists:time_entries,id',
            'image' => 'nullable|image|max:10240',
            'filename' => 'nullable|string|max:255',
            'thumbnail' => 'nullable|string|max:65535',
            'blurred' => 'nullable|boolean',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $timeEntry = TimeEntry::with('user')->find($validated['time_entry_id']);
        if (!$timeEntry || !$timeEntry->user || $timeEntry->user->organization_id !== $user->organization_id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if (!$this->canViewAll($user) && $timeEntry->user_id !== $user->id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $filename = $validated['filename'] ?? null;
        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('', 'screenshots');
            $filename = basename($path);
        }

        $filename = $filename ? basename($filename) : null;

        if (!$filename) {
            return response()->json(['message' => 'Screenshot image or filename is required.'], 422);
        }

        $screenshot = Screenshot::create([
            'time_entry_id' => $validated['time_entry_id'],
            'filename' => $filename,
            'thumbnail' => $validated['thumbnail'] ?? null,
            'blurred' => (bool)($validated['blurred'] ?? false),
        ]);

        return response()->json($screenshot, 201);
    }

    public function file(Request $request, Screenshot $screenshot): BinaryFileResponse|\Illuminate\Http\JsonResponse
    {
        $path = basename((string) $screenshot->filename);

        if ($path === '' || !$request->hasValidSignature() || !Storage::disk('screenshots')->exists($path)) {
            return response()->json(['message' => 'Screenshot not found'], 404);
        }

        $extension = pathinfo($path, PATHINFO_EXTENSION);
        $downloadName = Str::slug(pathinfo($path, PATHINFO_FILENAME) ?: 'screenshot').($extension ? '.'.$extension : '');

        return response()->file(Storage::disk('screenshots')->path($path), [
            'Content-Type' => Storage::disk('screenshots')->mimeType($path) ?: 'image/png',
            'Content-Disposition' => 'inline; filename="'.$downloadName.'"',
            'Cache-Control' => 'private, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * Display the specified resource.
     */
    public function show(Screenshot $screenshot)
    {
        if (!$this->canAccessScreenshot($screenshot)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return response()->json($screenshot);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Screenshot $screenshot)
    {
        if (!$this->canAccessScreenshot($screenshot)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $validated = $request->validate([
            'thumbnail' => 'nullable|string',
            'blurred' => 'nullable|boolean',
        ]);

        $screenshot->update($validated);

        return response()->json($screenshot);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Screenshot $screenshot)
    {
        if (!$this->canAccessScreenshot($screenshot)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $screenshot->loadMissing('timeEntry.user');
        $this->auditLogService->log(
            action: 'screenshot.deleted',
            actor: request()->user(),
            target: $screenshot,
            metadata: [
                'time_entry_id' => $screenshot->time_entry_id,
                'user_id' => $screenshot->timeEntry?->user_id,
                'recorded_at' => (string) $screenshot->created_at,
            ],
            request: request()
        );

        Storage::disk('screenshots')->delete(basename((string) $screenshot->filename));
        $screenshot->delete();

        return response()->json(['message' => 'Screenshot deleted successfully']);
    }

    private function canAccessScreenshot(Screenshot $screenshot): bool
    {
        $user = request()->user();
        if (!$user) {
            return false;
        }

        $screenshot->loadMissing('timeEntry.user');
        if (!$screenshot->timeEntry || !$screenshot->timeEntry->user) {
            return false;
        }
        if ($screenshot->timeEntry->user->organization_id !== $user->organization_id) {
            return false;
        }
        if ($this->canViewAll($user)) {
            return true;
        }
        return $screenshot->timeEntry->user_id === $user->id;
    }
}
