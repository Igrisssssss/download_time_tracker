<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'status' => 'ok',
        'service' => 'carevance-hrms-api',
        'message' => 'API is running',
    ]);
});
