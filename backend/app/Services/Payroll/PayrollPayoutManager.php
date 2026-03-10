<?php

namespace App\Services\Payroll;

class PayrollPayoutManager
{
    public function __construct(
        private readonly MockPayrollPayoutService $mockPayoutService,
        private readonly StripePayrollPayoutService $stripePayoutService,
    ) {
    }

    public function resolveForCurrentMode(): PayrollPayoutService
    {
        $mode = (string) config('payroll.mode', 'mock');

        return in_array($mode, ['stripe_test', 'stripe_live'], true)
            ? $this->stripePayoutService
            : $this->mockPayoutService;
    }

    public function mode(): string
    {
        return (string) config('payroll.mode', 'mock');
    }
}

