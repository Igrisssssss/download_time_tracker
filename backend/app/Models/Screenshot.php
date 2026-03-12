<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\URL;

class Screenshot extends Model
{
    protected $fillable = ['time_entry_id', 'filename', 'thumbnail', 'blurred'];

    protected $casts = [
        'blurred' => 'boolean',
    ];

    protected $appends = ['path', 'recorded_at'];

    public function timeEntry(): BelongsTo
    {
        return $this->belongsTo(TimeEntry::class);
    }

    public function getPathAttribute(): string
    {
        return URL::temporarySignedRoute(
            'screenshots.file',
            now()->addMinutes((int) env('SCREENSHOT_URL_TTL_MINUTES', 5)),
            ['screenshot' => $this->getKey()]
        );
    }

    public function getRecordedAtAttribute(): string
    {
        return (string) $this->created_at;
    }
}
