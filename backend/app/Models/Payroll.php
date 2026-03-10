<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Payroll extends Model
{
    protected $fillable = [
        'organization_id',
        'user_id',
        'payroll_month',
        'basic_salary',
        'allowances',
        'deductions',
        'bonus',
        'tax',
        'net_salary',
        'payroll_status',
        'payout_method',
        'payout_status',
        'generated_by',
        'updated_by',
        'processed_at',
        'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'basic_salary' => 'float',
            'allowances' => 'float',
            'deductions' => 'float',
            'bonus' => 'float',
            'tax' => 'float',
            'net_salary' => 'float',
            'processed_at' => 'datetime',
            'paid_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function generatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'generated_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(PayrollTransaction::class);
    }
}

