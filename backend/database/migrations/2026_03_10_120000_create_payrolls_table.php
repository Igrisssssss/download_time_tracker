<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payrolls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('payroll_month', 7);
            $table->decimal('basic_salary', 12, 2)->default(0);
            $table->decimal('allowances', 12, 2)->default(0);
            $table->decimal('deductions', 12, 2)->default(0);
            $table->decimal('bonus', 12, 2)->default(0);
            $table->decimal('tax', 12, 2)->default(0);
            $table->decimal('net_salary', 12, 2)->default(0);
            $table->string('payroll_status', 20)->default('draft');
            $table->string('payout_method', 20)->default('mock');
            $table->string('payout_status', 20)->default('pending');
            $table->foreignId('generated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('processed_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'user_id', 'payroll_month'], 'payrolls_org_user_month_unique');
            $table->index(['organization_id', 'payroll_month'], 'payrolls_org_month_idx');
            $table->index(['organization_id', 'payroll_status'], 'payrolls_org_status_idx');
            $table->index(['organization_id', 'payout_status'], 'payrolls_org_payout_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payrolls');
    }
};

