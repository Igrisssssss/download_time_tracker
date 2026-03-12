<?php

use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TimeEntryController;
use Illuminate\Support\Facades\Route;

Route::apiResource('tasks', TaskController::class);
Route::patch('/tasks/{task}/status', [TaskController::class, 'updateStatus']);
Route::get('/tasks/{id}/time-entries', [TaskController::class, 'timeEntries']);
Route::post('/time-entries/start', [TimeEntryController::class, 'start']);
Route::post('/time-entries/stop', [TimeEntryController::class, 'stop']);
Route::get('/time-entries/active', [TimeEntryController::class, 'active']);
Route::get('/time-entries/today', [TimeEntryController::class, 'today']);
Route::apiResource('time-entries', TimeEntryController::class);
