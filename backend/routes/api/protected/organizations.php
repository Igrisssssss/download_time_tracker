<?php

use App\Http\Controllers\Api\OrganizationController;
use Illuminate\Support\Facades\Route;

Route::get('/organizations', [OrganizationController::class, 'index']);
Route::get('/organizations/{organization}', [OrganizationController::class, 'show']);

Route::middleware('role:admin,manager')->group(function () {
    Route::post('/organizations', [OrganizationController::class, 'store']);
    Route::match(['put', 'patch'], '/organizations/{organization}', [OrganizationController::class, 'update']);
    Route::delete('/organizations/{organization}', [OrganizationController::class, 'destroy']);
    Route::get('/organizations/{id}/members', [OrganizationController::class, 'members']);
    Route::post('/organizations/{id}/invite', [OrganizationController::class, 'invite']);
});
