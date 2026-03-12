<?php

use App\Http\Controllers\Api\InvoiceController;
use Illuminate\Support\Facades\Route;

Route::middleware('role:admin,manager')->group(function () {
    Route::apiResource('invoices', InvoiceController::class);
    Route::post('/invoices/{id}/send', [InvoiceController::class, 'send']);
    Route::post('/invoices/{id}/mark-paid', [InvoiceController::class, 'markPaid']);
});
