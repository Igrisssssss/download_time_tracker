<?php

use App\Http\Controllers\Api\PayrollController;
use Illuminate\Support\Facades\Route;

Route::middleware('role:admin,manager')->group(function () {
Route::get('/payroll/structures', [PayrollController::class, 'structures']);
Route::post('/payroll/structures', [PayrollController::class, 'upsertStructure']);
Route::put('/payroll/structures/{id}', [PayrollController::class, 'updateStructure']);
Route::delete('/payroll/structures/{id}', [PayrollController::class, 'deleteStructure']);
Route::get('/payroll/employees', [PayrollController::class, 'employees']);
Route::get('/payroll/records', [PayrollController::class, 'records']);
Route::post('/payroll/records/generate', [PayrollController::class, 'generateRecords']);
Route::get('/payroll/records/{id}', [PayrollController::class, 'showRecord']);
Route::patch('/payroll/records/{id}', [PayrollController::class, 'updateRecord']);
Route::post('/payroll/records/{id}/status', [PayrollController::class, 'updateRecordStatus']);
Route::post('/payroll/records/{id}/payout', [PayrollController::class, 'payoutRecord']);
Route::post('/payroll/records/{id}/sync-stripe-checkout', [PayrollController::class, 'syncStripeCheckout']);
Route::get('/payroll/records/{id}/transactions', [PayrollController::class, 'recordTransactions']);
Route::post('/payroll/payslips/generate', [PayrollController::class, 'generatePayslip']);
Route::post('/payroll/payslips/pay-now', [PayrollController::class, 'payNow']);
});

Route::get('/payroll/payslips', [PayrollController::class, 'payslips']);
Route::get('/payroll/payslips/{id}', [PayrollController::class, 'showPayslip']);
Route::get('/payroll/payslips/{id}/pdf', [PayrollController::class, 'downloadPayslipPdf']);
