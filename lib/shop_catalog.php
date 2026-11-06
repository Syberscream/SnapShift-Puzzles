<?php
// Copy to: lib/shop_catalog.php
// Keep Printful token server-side only (env var or private config file).

function snapshift_shop_catalog(): array
{
    return [
        'i-will-finish-this-hoodie' => [
            'name' => 'I Will Finish This Hoodie',
            'checkout_type' => 'payment_link',
            'checkout_url' => 'https://buy.stripe.com/4gM4gAg8K8ltfiFdcfgYU01',
            'printful_sync_variant_id' => 0,
            'price_label' => '$49.00',
        ],
        'one-more-move-tee' => [
            'name' => 'One More Move Tee',
            'checkout_type' => 'payment_link',
            'checkout_url' => 'PASTE_STRIPE_PAYMENT_LINK_HERE',
            'printful_sync_variant_id' => 0,
            'price_label' => '$29.00',
        ],
        'locked-in-hoodie' => [
            'name' => 'Locked In Hoodie',
            'checkout_type' => 'payment_link',
            'checkout_url' => 'PASTE_STRIPE_PAYMENT_LINK_HERE',
            'printful_sync_variant_id' => 0,
            'price_label' => '$49.00',
        ],
        'shift-happens-mug' => [
            'name' => 'Shift Happens Mug',
            'checkout_type' => 'payment_link',
            'checkout_url' => 'PASTE_STRIPE_PAYMENT_LINK_HERE',
            'printful_sync_variant_id' => 0,
            'price_label' => '$19.00',
        ],
        'professional-tile-shuffler-stickers' => [
            'name' => 'Professional Tile Shuffler Stickers',
            'checkout_type' => 'payment_link',
            'checkout_url' => 'PASTE_STRIPE_PAYMENT_LINK_HERE',
            'printful_sync_variant_id' => 0,
            'price_label' => '$9.00',
        ],
        'daily-challenge-bundle' => [
            'name' => 'Daily Challenge Bundle',
            'checkout_type' => 'payment_link',
            'checkout_url' => 'PASTE_STRIPE_PAYMENT_LINK_HERE',
            'printful_sync_variant_id' => 0,
            'price_label' => '$59.00',
        ],
    ];
}
