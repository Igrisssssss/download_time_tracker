FROM composer:2 AS vendor

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

FROM php:8.3-cli

WORKDIR /var/www/html

RUN apt-get update \
    && apt-get install -y --no-install-recommends git unzip libpq-dev \
    && docker-php-ext-install pdo pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY --from=vendor /app/vendor ./vendor
COPY . .

EXPOSE 10000

CMD ["sh", "-lc", "php artisan storage:link || true; php artisan migrate --force; php artisan serve --host=0.0.0.0 --port=${PORT:-10000}"]
