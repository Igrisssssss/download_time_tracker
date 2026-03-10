<?php

namespace Tests\Unit;

use App\Services\Payroll\PayrollCalculatorService;
use PHPUnit\Framework\TestCase;

class PayrollCalculatorServiceTest extends TestCase
{
    public function test_calculates_net_salary_using_expected_formula(): void
    {
        $service = new PayrollCalculatorService();

        $net = $service->calculateNetSalary(
            basicSalary: 50000,
            allowances: 5000,
            bonus: 2000,
            deductions: 1500,
            tax: 3500
        );

        $this->assertSame(52000.0, $net);
    }
}

