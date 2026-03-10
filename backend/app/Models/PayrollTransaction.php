<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollTransaction extends Model
{
    protected $fillable = [
        'payroll_id',
        'provider',
        'transaction_id',
        'amount',
        'currency',
        'status',
        'raw_response',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'raw_response' => 'array',
        ];
    }

    public function payroll(): BelongsTo
    {
        return $this->belongsTo(Payroll::class);
    }
}

