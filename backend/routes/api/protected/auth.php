<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;

Route::get('/auth/me', [AuthController::class, 'user']);
Route::post('/auth/logout', [AuthController::class, 'logout']);
Route::post('/auth/handoff', [AuthController::class, 'handoff'])->middleware('throttle:auth.handoff');
