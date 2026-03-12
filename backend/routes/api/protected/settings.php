<?php

use App\Http\Controllers\Api\SettingsController;
use Illuminate\Support\Facades\Route;

Route::get('/settings/me', [SettingsController::class, 'me']);
Route::put('/settings/profile', [SettingsController::class, 'updateProfile']);
Route::put('/settings/password', [SettingsController::class, 'updatePassword'])->middleware('throttle:settings.password');
Route::put('/settings/preferences', [SettingsController::class, 'updatePreferences']);
Route::put('/settings/organization', [SettingsController::class, 'updateOrganization'])->middleware('role:admin,manager');
Route::get('/settings/billing', [SettingsController::class, 'billing']);
