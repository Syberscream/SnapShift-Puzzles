<?php
declare(strict_types=1);

// Copy to: api/create_checkout.php
// Requires: lib/shop_catalog.php
// Phase 1: redirect to Stripe Payment Links.
// Phase 2: replace with Stripe Checkout Session creation if needed.

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../lib/shop_catalog.php';

$productId = trim((string)($_GET['product'] ?? $_POST['product'] ?? ''));
$catalog = snapshift_shop_catalog();

if ($productId === '' || !isset($catalog[$productId])) {
    http_response_code(404);
    echo json_encode([
        'ok' => false,
        'message' => 'Unknown shop product.'
    ]);
    exit;
}

$product = $catalog[$productId];
$checkoutUrl = trim((string)($product['checkout_url'] ?? ''));

if ($checkoutUrl === '' || str_contains($checkoutUrl, 'PASTE_STRIPE_PAYMENT_LINK_HERE')) {
    http_response_code(200);
    echo json_encode([
        'ok' => false,
        'message' => $product['name'] . ' is not live yet. Add its payment link in lib/shop_catalog.php.'
    ]);
    exit;
}

echo json_encode([
    'ok' => true,
    'product' => $productId,
    'checkout_url' => $checkoutUrl,
]);
