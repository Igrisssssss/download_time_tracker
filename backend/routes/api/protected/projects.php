<?php

use App\Http\Controllers\Api\ProjectController;
use Illuminate\Support\Facades\Route;

Route::apiResource('projects', ProjectController::class);
Route::get('/projects/{id}/time-entries', [ProjectController::class, 'timeEntries']);
Route::get('/projects/{id}/tasks', [ProjectController::class, 'tasks']);
Route::get('/projects/{id}/stats', [ProjectController::class, 'stats']);
