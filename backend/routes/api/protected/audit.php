<?php

use App\Http\Controllers\Api\AuditLogController;
use Illuminate\Support\Facades\Route;

Route::middleware('role:admin,manager')->group(function () {
    Route::get('/audit-logs', [AuditLogController::class, 'index']);
});
