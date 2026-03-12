<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('auth.login', function (Request $request) {
            $email = Str::lower((string) $request->input('email', 'guest'));

            return [
                Limit::perMinute((int) env('RATE_LIMIT_LOGIN_PER_MINUTE', 5))->by($email.'|'.$request->ip()),
                Limit::perMinute((int) env('RATE_LIMIT_LOGIN_IP_PER_MINUTE', 20))->by($request->ip()),
            ];
        });

        RateLimiter::for('auth.register', fn (Request $request) => [
            Limit::perMinute((int) env('RATE_LIMIT_REGISTER_PER_MINUTE', 3))->by($request->ip()),
        ]);

        RateLimiter::for('auth.handoff', fn (Request $request) => [
            Limit::perMinute((int) env('RATE_LIMIT_HANDOFF_PER_MINUTE', 10))->by((string) optional($request->user())->getAuthIdentifier()),
        ]);

        RateLimiter::for('settings.password', fn (Request $request) => [
            Limit::perMinute((int) env('RATE_LIMIT_PASSWORD_PER_MINUTE', 5))->by((string) optional($request->user())->getAuthIdentifier()),
        ]);

        RateLimiter::for('screenshots.upload', fn (Request $request) => [
            Limit::perMinute((int) env('RATE_LIMIT_SCREENSHOTS_PER_MINUTE', 30))->by((string) optional($request->user())->getAuthIdentifier()),
        ]);

        RateLimiter::for('chat.messages', fn (Request $request) => [
            Limit::perMinute((int) env('RATE_LIMIT_CHAT_MESSAGES_PER_MINUTE', 60))->by((string) optional($request->user())->getAuthIdentifier()),
        ]);

        RateLimiter::for('notifications.publish', fn (Request $request) => [
            Limit::perMinute((int) env('RATE_LIMIT_NOTIFICATION_PUBLISH_PER_MINUTE', 10))->by((string) optional($request->user())->getAuthIdentifier()),
        ]);

        RateLimiter::for('desktop.download', fn (Request $request) => [
            Limit::perMinute((int) env('RATE_LIMIT_DESKTOP_DOWNLOAD_PER_MINUTE', 10))->by($request->ip()),
        ]);
    }
}
