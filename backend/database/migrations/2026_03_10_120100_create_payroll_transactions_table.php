<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_id')->constrained('payrolls')->cascadeOnDelete();
            $table->string('provider', 20);
            $table->string('transaction_id', 120)->nullable();
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('currency', 8)->default('INR');
            $table->string('status', 20)->default('pending');
            $table->json('raw_response')->nullable();
            $table->timestamps();

            $table->index(['provider', 'transaction_id'], 'payroll_transactions_provider_tx_idx');
            $table->index(['payroll_id', 'status'], 'payroll_transactions_payroll_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_transactions');
    }
};

