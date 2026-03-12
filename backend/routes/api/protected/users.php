<?php

use App\Http\Controllers\Api\ReportGroupController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/users', [UserController::class, 'index']);
Route::post('/users', [UserController::class, 'store'])->middleware('role:admin,manager');
Route::get('/users/{user}', [UserController::class, 'show']);
Route::match(['put', 'patch'], '/users/{user}', [UserController::class, 'update'])->middleware('role:admin,manager');
Route::delete('/users/{user}', [UserController::class, 'destroy'])->middleware('role:admin,manager');
Route::get('/users/{id}/stats', [UserController::class, 'stats']);
Route::get('/users/{id}/profile-360', [UserController::class, 'profile360']);

Route::middleware('role:admin,manager')->group(function () {
    Route::get('/report-groups', [ReportGroupController::class, 'index']);
    Route::post('/report-groups', [ReportGroupController::class, 'store']);
    Route::put('/report-groups/{id}', [ReportGroupController::class, 'update']);
    Route::delete('/report-groups/{id}', [ReportGroupController::class, 'destroy']);
});
