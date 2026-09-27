import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    preferences: v.optional(v.any()),
    lastActiveAt: v.number(),
    role: v.optional(v.string()),
    canonicalPurchaserAccountId: v.optional(v.string()),
    /** Unique friend-invite code (Give one, get one). */
    referralCode: v.optional(v.string()),
    /** Set once when this account successfully applies someone else's referral code. */
    referredByUserId: v.optional(v.id('users')),
    referralAppliedAt: v.optional(v.number()),
    /** How many other accounts successfully applied this user's invite code. */
    successfulReferralCount: v.optional(v.number()),
    /** Set when account deletion starts; user row is removed after Clerk delete. */
    deletionPendingAt: v.optional(v.number()),
  })
    .index('by_clerk_id', ['clerkId'])
    .index('by_referral_code', ['referralCode'])
    .index('by_referred_by', ['referredByUserId']),

  purchaser_accounts: defineTable({
    appUserId: v.string(),
    kind: v.string(),
    linkedUserId: v.optional(v.id('users')),
    mergedIntoId: v.optional(v.string()),
    state: v.string(),
    createdAt: v.number(),
    linkedAt: v.optional(v.number()),
    lastSeenAt: v.number(),
    lastPlatform: v.string(),
    lastAppVersion: v.string(),
  })
    .index('by_app_user_id', ['appUserId'])
    .index('by_linked_user', ['linkedUserId']),

  categories: defineTable({
    /** Unique active canonical keys (English). Written at seed time; avoids counting rows per query. */
    questionCount: v.optional(v.number()),
    slug: v.string(),
    title: v.string(),
    themeGroup: v.optional(v.string()),
    artwork: v.optional(v.string()),
    enabled: v.boolean(),
  })
    .index('by_slug', ['slug'])
    .index('by_enabled', ['enabled']),

  category_translations: defineTable({
    categoryId: v.id('categories'),
    locale: v.string(),
    title: v.string(),
  })
    .index('by_category_locale', ['categoryId', 'locale'])
    .index('by_locale', ['locale']),

  questions: defineTable({
    categoryId: v.id('categories'),
    canonicalKey: v.string(),
    prompt: v.string(),
    answer: v.string(),
    pointValue: v.number(),
    difficultyTier: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    locale: v.string(),
    status: v.string(),
    hiddenMultiplier: v.optional(v.number()),
    isOvertimeSurge: v.optional(v.boolean()),
    /** Bundled asset key in constants/questionImages.ts (picture topics). */
    promptImageKey: v.optional(v.string()),
  })
    .index('by_category', ['categoryId'])
    .index('by_category_status', ['categoryId', 'status'])
    .index('by_category_locale_status', ['categoryId', 'locale', 'status'])
    .index('by_canonical_locale', ['canonicalKey', 'locale']),

  device_installations: defineTable({
    deviceId: v.string(),
    userId: v.optional(v.id('users')),
    purchaserAccountId: v.optional(v.string()),
    platform: v.string(),
    appVersion: v.string(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index('by_device', ['deviceId'])
    .index('by_user_device', ['userId', 'deviceId'])
    .index('by_purchaser_account', ['purchaserAccountId']),

  device_question_history: defineTable({
    deviceId: v.string(),
    canonicalKey: v.string(),
    questionId: v.optional(v.id('questions')),
    categoryId: v.id('categories'),
    sessionId: v.optional(v.string()),
    askedAt: v.number(),
  })
    .index('by_device', ['deviceId'])
    .index('by_device_canonical', ['deviceId', 'canonicalKey']),

  score_events: defineTable({
    sessionId: v.string(),
    teamId: v.string(),
    points: v.number(),
    reason: v.string(),
    questionId: v.optional(v.string()),
    turnIndex: v.number(),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
  }).index('by_session', ['sessionId']),

  game_sessions: defineTable({
    mode: v.string(),
    configSnapshot: v.any(),
    seed: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    winningTeamId: v.optional(v.string()),
    userId: v.optional(v.id('users')),
    clientSessionId: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  })
    .index('by_user', ['userId'])
    .index('by_started', ['startedAt'])
    .index('by_client_session', ['clientSessionId']),

  /** One row per locked-in board start: which topics were chosen. */
  topic_selections: defineTable({
    clientSessionId: v.string(),
    userId: v.id('users'),
    mode: v.string(),
    categorySlugs: v.array(v.string()),
    selectedAt: v.number(),
  })
    .index('by_client_session', ['clientSessionId'])
    .index('by_selected_at', ['selectedAt']),

  game_participants: defineTable({
    sessionId: v.id('game_sessions'),
    teamId: v.string(),
    playerName: v.optional(v.string()),
    hotSeatEligible: v.boolean(),
    finalScore: v.number(),
  }).index('by_session', ['sessionId']),

  rapid_fire_runs: defineTable({
    userId: v.id('users'),
    deviceId: v.optional(v.string()),
    runId: v.optional(v.string()),
    selectedCategories: v.array(v.string()),
    score: v.number(),
    answerAccuracy: v.number(),
    durationMs: v.number(),
    idempotencyKey: v.optional(v.string()),
  })
    .index('by_user', ['userId'])
    .index('by_run_id', ['runId'])
    .index('by_idempotency', ['idempotencyKey']),

  wallets: defineTable({
    userId: v.optional(v.id('users')),
    purchaserAccountId: v.optional(v.string()),
    balance: v.number(),
    tokenCap: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_purchaser_account', ['purchaserAccountId']),

  wallet_transactions: defineTable({
    walletId: v.id('wallets'),
    type: v.string(),
    amount: v.number(),
    source: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    status: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    reservationId: v.optional(v.string()),
    productKey: v.optional(v.string()),
    store: v.optional(v.string()),
    storeTransactionId: v.optional(v.string()),
    originalStoreTransactionId: v.optional(v.string()),
    purchaseId: v.optional(v.id('store_purchases')),
    adminActorUserId: v.optional(v.id('users')),
    reversalOf: v.optional(v.id('wallet_transactions')),
    priceAmountMicros: v.optional(v.number()),
    currencyCode: v.optional(v.string()),
  })
    .index('by_wallet', ['walletId'])
    .index('by_wallet_created', ['walletId', 'createdAt'])
    .index('by_wallet_idempotency', ['walletId', 'idempotencyKey'])
    .index('by_reservation', ['reservationId'])
    .index('by_purchase_id', ['purchaseId'])
    .index('by_created', ['createdAt']),

  token_products: defineTable({
    productKey: v.string(),
    tokensGranted: v.number(),
    iosProductId: v.string(),
    androidProductId: v.string(),
    isActive: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_product_key', ['productKey'])
    .index('by_ios_product_id', ['iosProductId'])
    .index('by_android_product_id', ['androidProductId'])
    .index('by_sort_order', ['sortOrder']),

  store_purchases: defineTable({
    purchaserAccountId: v.string(),
    productKey: v.string(),
    store: v.string(),
    environment: v.optional(v.string()),
    storeTransactionId: v.string(),
    originalStoreTransactionId: v.optional(v.string()),
    revenueCatEventId: v.string(),
    priceAmountMicros: v.optional(v.number()),
    currencyCode: v.optional(v.string()),
    purchasedAt: v.number(),
    status: v.string(),
    rawEvent: v.any(),
    promoCodeId: v.optional(v.id('promo_codes')),
    commissionAmountMicros: v.optional(v.number()),
  })
    .index('by_purchaser_account', ['purchaserAccountId'])
    .index('by_store_transaction', ['store', 'storeTransactionId'])
    .index('by_original_store_transaction', ['store', 'originalStoreTransactionId'])
    .index('by_revenuecat_event', ['revenueCatEventId'])
    .index('by_purchased_at', ['purchasedAt'])
    .index('by_promo_code', ['promoCodeId']),

  payment_webhook_events: defineTable({
    eventId: v.string(),
    type: v.string(),
    appUserId: v.optional(v.string()),
    originalAppUserId: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    status: v.string(),
    errorCode: v.optional(v.string()),
    payload: v.any(),
  })
    .index('by_event_id', ['eventId'])
    .index('by_status', ['status'])
    .index('by_app_user_id', ['appUserId']),

  promo_codes: defineTable({
    code: v.string(),
    rewardType: v.string(),
    rewardAmount: v.number(),
    usageCap: v.number(),
    mode: v.optional(v.string()),
    redemptionScope: v.optional(v.string()),
    restrictedToUserId: v.optional(v.id('users')),
    restrictedToPurchaserAccountId: v.optional(v.string()),
    activeFrom: v.optional(v.number()),
    activeTo: v.optional(v.number()),
    usedCount: v.optional(v.number()),
    perUserLimit: v.optional(v.number()),
    active: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    createdByAdminUserId: v.optional(v.id('users')),
    updatedByAdminUserId: v.optional(v.id('users')),
    discountPercent: v.optional(v.number()),
    productKey: v.optional(v.string()),
    affiliateEmail: v.optional(v.string()),
    commissionPercent: v.optional(v.number()),
    /**
     * RevenueCat API v2 discount provisioning state for discount reward types.
     *
     * - `pending`: local row inserted, provider provisioning in flight.
     * - `provisioned`: provider discount + code created, code is usable.
     * - `failed`: provider provisioning failed; the local code must NOT be
     *   presented as usable. Admin can retry or delete the row.
     * - `disable_pending`: local active=false (validation rejects it) but the
     *   provider discount could not be disabled yet (e.g. env not configured
     *   or transient API failure). The hourly reconciliation retries the
     *   provider disable; only on success does the status become `disabled`.
     * - `disabled`: provider discount disabled (deactivation or expiry).
     *
     * Token-only codes never set this field.
     */
    revenueCatProvisioningStatus: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('provisioned'),
        v.literal('failed'),
        v.literal('disable_pending'),
        v.literal('disabled')
      )
    ),
    /** RevenueCat API v2 discount id returned by POST /discounts. */
    revenueCatDiscountId: v.optional(v.string()),
    /** RevenueCat API v2 discount identifier (stable, used for webhook matching). */
    revenueCatDiscountIdentifier: v.optional(v.string()),
    /** Canonical uppercase code sent to RevenueCat (local code is lowercase). */
    revenueCatProviderCode: v.optional(v.string()),
    provisioningError: v.optional(v.string()),
  })
    .index('by_code', ['code'])
    .index('by_affiliate_email', ['affiliateEmail'])
    .index('by_rc_provisioning', ['revenueCatProvisioningStatus']),

  promo_redemptions: defineTable({
    promoCodeId: v.id('promo_codes'),
    userId: v.id('users'),
    redeemedAt: v.number(),
    transactionId: v.id('wallet_transactions'),
  })
    .index('by_user', ['userId'])
    .index('by_promo_code', ['promoCodeId'])
    .index('by_user_promo', ['userId', 'promoCodeId']),

  /**
   * Pending discount-code claims for web checkout attribution.
   *
   * A claim is created when a signed-in web user validates a discount promo
   * for a specific bundle. The webhook/client-sync path consumes the claim
   * once the matching purchase is granted, attributing the sale to the promo
   * and computing commission from the actual post-discount charged amount.
   * Claims expire (default 1h) so a stale code cannot be attributed later.
   */
  promo_discount_claims: defineTable({
    promoCodeId: v.id('promo_codes'),
    userId: v.id('users'),
    purchaserAccountId: v.string(),
    productKey: v.string(),
    claimedAt: v.number(),
    expiresAt: v.number(),
    status: v.string(),
    consumedPurchaseId: v.optional(v.id('store_purchases')),
    consumedAt: v.optional(v.number()),
  })
    .index('by_user_promo', ['userId', 'promoCodeId'])
    .index('by_purchaser_product_status', ['purchaserAccountId', 'productKey', 'status'])
    .index('by_promo_status', ['promoCodeId', 'status']),

  question_reports: defineTable({
    userId: v.id('users'),
    questionId: v.string(),
    canonicalKey: v.string(),
    categoryId: v.optional(v.string()),
    categoryName: v.optional(v.string()),
    locale: v.optional(v.string()),
    prompt: v.string(),
    answer: v.string(),
    reasons: v.array(v.string()),
    problemLocation: v.union(
      v.literal('question'),
      v.literal('answer'),
      v.literal('both')
    ),
    otherText: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_user_and_created', ['userId', 'createdAt'])
    .index('by_canonical', ['canonicalKey'])
    .index('by_created', ['createdAt']),

  feature_flags: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    value: v.optional(v.any()),
  }).index('by_key', ['key']),

  /** Tracks failed admin password sign-ins per normalized identifier (sliding 1h window). */
  admin_password_sign_in_rates: defineTable({
    identifierKey: v.string(),
    failureTimestamps: v.array(v.number()),
  }).index('by_identifier_key', ['identifierKey']),

  /** Per-user failed promo redeem attempts (sliding window; code enumeration defense). */
  promo_redeem_rates: defineTable({
    userId: v.id('users'),
    attemptTimestamps: v.array(v.number()),
  }).index('by_user', ['userId']),

  /**
   * Immutable admin audit log. Records admin mutations (promo create/update/
   * deactivate, wallet adjustments, purchase reversals). Append-only: no update
   * or delete mutations are exposed for this table.
   */
  admin_audit_log: defineTable({
    actorUserId: v.id('users'),
    actorEmail: v.optional(v.string()),
    timestamp: v.number(),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    reason: v.optional(v.string()),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
  })
    .index('by_timestamp', ['timestamp'])
    .index('by_target', ['targetType', 'targetId'])
    .index('by_action', ['action']),
});
