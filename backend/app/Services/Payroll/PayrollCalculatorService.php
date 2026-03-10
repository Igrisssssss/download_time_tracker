<?php

namespace App\Services\Payroll;

class PayrollCalculatorService
{
    public function calculateNetSalary(
        float $basicSalary,
        float $allowances,
        float $bonus,
        float $deductions,
        float $tax
    ): float {
        return round($basicSalary + $allowances + $bonus - $deductions - $tax, 2);
    }
}

