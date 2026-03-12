<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DesktopDownloadController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\ScreenshotController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:auth.register');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:auth.login');
Route::get('/downloads/desktop/windows', [DesktopDownloadController::class, 'windows'])->middleware('throttle:desktop.download');
Route::get('/screenshots/{screenshot}/file', [ScreenshotController::class, 'file'])
    ->middleware('signed')
    ->name('screenshots.file');
Route::post('/payroll/webhooks/stripe', [PayrollController::class, 'stripeWebhook']);
