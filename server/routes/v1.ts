import crypto from 'node:crypto';
import {Router} from 'express';
import {
  LIBERIA_COUNTIES,
  QUESTION_STATUSES,
  SUPPORTED_LANGUAGES,
} from '../constants.ts';
import {getDb} from '../db.ts';
import {askAgriculturalAdvisor, isAiConfigured} from '../ai.ts';
import {prototypeRouter} from './prototype.ts';
import {idempotent} from '../idempotency.ts';
import {normalizeLiberianPhone} from '../../src/lib/phone.ts';
import {authSecurityRouter} from './authSecurity.ts';
import {
  CHALLENGE_COOKIE, CLAIM_COOKIE, DEVICE_COOKIE, challengeCookieOptions, clearHold, findTrustedDevice, getSessionVersion, hasPhoneOnFile, passwordProblem, resolvePhoneForRegistration,
} from '../authSecurity.ts';
import {OtpError, maskPhone, startChallenge} from '../otp.ts';
import {getAuthConfig} from '../authConfig.ts';
import {getSmsProvider} from '../sms/index.ts';
import {loginIpFailMax} from '../limits.ts';
import {demoEnvironment, demoPhoneProblem, isSyntheticPhone, syntheticOnlyMessage} from '../demoPolicy.ts';
import {
  type AuthedRequest,
  CSRF_COOKIE_NAME,
  PasswordBusyError,
  SESSION_COOKIE_NAME,
  asyncRoute,
  checkAndRecordRateLimit,
  clearCookieOptions,
  clientAddress,
  cookieOptions,
  hashIdentifier,
  hashPassword,
  hashPasswordAsync,
  loadUserById,
  normalizePhone,
  recordRateLimitAttempt,
  requireAuth,
  requireRole,
  signSessionToken,
  verifyAgainstDummy,
  verifyCsrf,
  verifyPassword,
  verifyPasswordAsync,
  writeAuditLog,
} from '../security.ts';

export const v1Router = Router();

// Apply CSRF protection to all state-changing API requests
v1Router.use(verifyCsrf);
v1Router.use(prototypeRouter);
// Verification, new-device sign-in, password recovery, phone ownership, trusted devices (registered BEFORE the routes below that they replace)
v1Router.use(authSecurityRouter);

// 1. Health & CSRF
v1Router.get('/health', (_req, res) => {
  try {
    const db = getDb();
    const mig = db
      .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 1')
      .get() as {version: string; applied_at: string} | undefined;
    const guideStats = db
      .prepare("SELECT COUNT(*) as total FROM agricultural_guides WHERE is_published = 1 AND review_status = 'approved'")
      .get() as {total: number};

    res.json({
      status: 'ok',
      service: 'agri-advisory-liberia-api',
      apiVersion: 'v1',
      database: 'connected',
      latestMigration: mig?.version ?? null,
      publishedGuides: guideStats.total,
      aiConfigured: isAiConfigured(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: {code: 'HEALTH_CHECK_FAILED', message: err instanceof Error ? err.message : 'Database error'},
    });
  }
});

v1Router.get('/csrf-token', (req: AuthedRequest, res) => {
  const token =
    req.csrfToken ||
    (req.cookies?.[CSRF_COOKIE_NAME] as string | undefined) ||
    crypto.randomBytes(24).toString('hex');
  if (!req.cookies?.[CSRF_COOKIE_NAME] && !req.csrfToken) {
    res.cookie(CSRF_COOKIE_NAME, token, cookieOptions(req, false));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({csrfToken: token});
});

// 2. Public Home Summary & Metadata
v1Router.get('/public/home', (_req, res) => {
  const db = getDb();
  const crops = db
    .prepare('SELECT id, slug, name, local_names, summary, season_note, image_url FROM crops ORDER BY display_order ASC')
    .all();
  const categories = db
    .prepare('SELECT id, slug, name, description FROM guide_categories ORDER BY display_order ASC')
    .all();
  const settingsRows = db.prepare('SELECT key, value FROM platform_settings').all() as {
    key: string;
    value: string;
  }[];
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));

  const featuredGuides = db
    .prepare(
      `SELECT g.id, g.slug, g.title, g.summary, g.image_url, g.is_sample_demo, g.is_pest_disease,
              g.version, g.last_reviewed_at, g.reviewed_by_name, c.name AS crop_name, c.slug AS crop_slug,
              cat.name AS category_name
       FROM agricultural_guides g
       JOIN crops c ON c.id = g.crop_id
       JOIN guide_categories cat ON cat.id = g.category_id
       WHERE g.is_published = 1 AND g.review_status = 'approved'
       ORDER BY g.id ASC
       LIMIT 6`
    )
    .all();

  res.json({
    crops,
    categories,
    featuredGuides,
    languages: SUPPORTED_LANGUAGES,
    counties: LIBERIA_COUNTIES,
    dailyTip: {
      title: settings.daily_tip_title || "Today's Farming Tip (Sample)",
      body:
        settings.daily_tip_body ||
        'Inspect the underside of cassava and pepper leaves early in the morning once a week.',
    },
    aiConfigured: isAiConfigured(),
  });
});

v1Router.get('/crops', (_req, res) => {
  const db = getDb();
  const crops = db
    .prepare('SELECT id, slug, name, local_names, summary, season_note, image_url FROM crops ORDER BY display_order ASC')
    .all();
  res.json({crops});
});

v1Router.get('/categories', (_req, res) => {
  const db = getDb();
  const categories = db
    .prepare('SELECT id, slug, name, description FROM guide_categories ORDER BY display_order ASC')
    .all();
  res.json({categories});
});

// 3. Public Guides (strictly published + approved)
v1Router.get('/guides', (req, res) => {
  const db = getDb();
  const crop = typeof req.query.crop === 'string' ? req.query.crop.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const pestOnly = req.query.pest === '1' || req.query.pest === 'true';
  const lang = typeof req.query.lang === 'string' ? req.query.lang.trim() : 'en';
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 24)));
  const offset = (page - 1) * limit;

  const where: string[] = ["g.is_published = 1", "g.review_status = 'approved'"];
  const args: (string | number)[] = [];

  if (crop) {
    where.push('c.slug = ?');
    args.push(crop);
  }
  if (category) {
    where.push('cat.slug = ?');
    args.push(category);
  }
  if (pestOnly) {
    where.push('g.is_pest_disease = 1');
  }
  if (q) {
    where.push('(g.title LIKE ? OR g.summary LIKE ? OR c.name LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like);
  }

  const whereSql = where.join(' AND ');
  const countRow = db
    .prepare(
      `SELECT COUNT(*) as total
       FROM agricultural_guides g
       JOIN crops c ON c.id = g.crop_id
       JOIN guide_categories cat ON cat.id = g.category_id
       WHERE ${whereSql}`
    )
    .get(...args) as {total: number};

  const rows = db
    .prepare(
      `SELECT g.id, g.slug, g.title, g.summary, g.content_markdown, g.image_url, g.language_code,
              g.source_attribution, g.is_sample_demo, g.is_pest_disease, g.review_status,
              g.reviewed_by_name, g.last_reviewed_at, g.version, g.offline_available, g.updated_at,
              c.id AS crop_id, c.slug AS crop_slug, c.name AS crop_name,
              cat.id AS category_id, cat.slug AS category_slug, cat.name AS category_name,
              t.title AS tr_title, t.summary AS tr_summary, t.translation_status AS tr_status
       FROM agricultural_guides g
       JOIN crops c ON c.id = g.crop_id
       JOIN guide_categories cat ON cat.id = g.category_id
       LEFT JOIN guide_translations t ON t.guide_id = g.id AND t.language_code = ? AND t.translation_status = 'reviewed'
       WHERE ${whereSql}
       ORDER BY g.id ASC
       LIMIT ? OFFSET ?`
    )
    .all(lang, ...args, limit, offset) as Array<Record<string, unknown>>;

  const guides = rows.map((row) => {
    const hasReviewedTranslation = Boolean(row.tr_title && lang !== 'en');
    return {
      id: row.id,
      slug: row.slug,
      title: hasReviewedTranslation ? row.tr_title : row.title,
      summary: hasReviewedTranslation ? row.tr_summary : row.summary,
      imageUrl: row.image_url,
      languageCode: hasReviewedTranslation ? lang : 'en',
      fallbackApplied: lang !== 'en' && !hasReviewedTranslation,
      translationStatus: hasReviewedTranslation ? row.tr_status : 'en_default',
      sourceAttribution: row.source_attribution,
      isSampleDemo: Boolean(row.is_sample_demo),
      isPestDisease: Boolean(row.is_pest_disease),
      reviewStatus: row.review_status,
      reviewedByName: row.reviewed_by_name,
      lastReviewedAt: row.last_reviewed_at,
      version: row.version,
      offlineAvailable: Boolean(row.offline_available),
      crop: {id: row.crop_id, slug: row.crop_slug, name: row.crop_name},
      category: {id: row.category_id, slug: row.category_slug, name: row.category_name},
      updatedAt: row.updated_at,
    };
  });

  res.json({
    guides,
    pagination: {page, limit, total: countRow.total, totalPages: Math.ceil(countRow.total / limit)},
  });
});

v1Router.get('/guides/:id', (req, res) => {
  const db = getDb();
  const idOrSlug = req.params.id;
  const lang = typeof req.query.lang === 'string' ? req.query.lang.trim() : 'en';
  const isNumeric = /^\d+$/.test(idOrSlug);

  const row = db
    .prepare(
      `SELECT g.*, c.slug AS crop_slug, c.name AS crop_name,
              cat.slug AS category_slug, cat.name AS category_name,
              t.title AS tr_title, t.summary AS tr_summary, t.content_markdown AS tr_content,
              t.translation_status AS tr_status, t.reviewed_by AS tr_reviewed_by
       FROM agricultural_guides g
       JOIN crops c ON c.id = g.crop_id
       JOIN guide_categories cat ON cat.id = g.category_id
       LEFT JOIN guide_translations t ON t.guide_id = g.id AND t.language_code = ? AND t.translation_status = 'reviewed'
       WHERE ${isNumeric ? 'g.id = ?' : 'g.slug = ?'}
         AND g.is_published = 1 AND g.review_status = 'approved'`
    )
    .get(lang, isNumeric ? Number(idOrSlug) : idOrSlug) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({error: {code: 'GUIDE_NOT_FOUND', message: 'Published agricultural guide not found.'}});
    return;
  }

  const hasReviewedTranslation = Boolean(row.tr_title && row.tr_content && lang !== 'en');

  res.json({
    guide: {
      id: row.id,
      slug: row.slug,
      title: hasReviewedTranslation ? row.tr_title : row.title,
      summary: hasReviewedTranslation ? row.tr_summary : row.summary,
      contentMarkdown: hasReviewedTranslation ? row.tr_content : row.content_markdown,
      imageUrl: row.image_url,
      languageCode: hasReviewedTranslation ? lang : 'en',
      fallbackApplied: lang !== 'en' && !hasReviewedTranslation,
      translationReviewedBy: hasReviewedTranslation ? row.tr_reviewed_by : null,
      sourceAttribution: row.source_attribution,
      isSampleDemo: Boolean(row.is_sample_demo),
      isPestDisease: Boolean(row.is_pest_disease),
      reviewStatus: row.review_status,
      reviewedByName: row.reviewed_by_name,
      lastReviewedAt: row.last_reviewed_at,
      version: row.version,
      offlineAvailable: Boolean(row.offline_available),
      crop: {id: row.crop_id, slug: row.crop_slug, name: row.crop_name},
      category: {id: row.category_id, slug: row.category_slug, name: row.category_name},
      updatedAt: row.updated_at,
    },
  });
});

// 4. Authentication Routes
v1Router.get('/auth/me', (req: AuthedRequest, res) => {
  res.json({user: req.user ?? null});
});

v1Router.post('/auth/register', asyncRoute(async (req: AuthedRequest, res) => {
  const db = getDb();
  const regSetting = db
    .prepare("SELECT value FROM platform_settings WHERE key = 'allow_public_registration'")
    .get() as {value: string} | undefined;
  if (regSetting && regSetting.value === 'false') {
    res.status(403).json({
      error: {
        code: 'REGISTRATION_DISABLED',
        message: 'Public farmer registration is currently disabled by an administrator.',
      },
    });
    return;
  }

  const ipKey = hashIdentifier(clientAddress(req));
  const rl = checkAndRecordRateLimit(ipKey, 'register', 10, 60, true);
  if (!rl.allowed) {
    res.status(429).json({error: {code: 'RATE_LIMITED', message: 'Too many registration attempts. Please try later.'}});
    return;
  }

  const {displayName, phone, email, password, county, preferredLanguage, cropsOfInterest} = req.body ?? {};
  const cleanName = typeof displayName === 'string' ? displayName.trim() : '';
  const phoneCheck = normalizeLiberianPhone(typeof phone === 'string' ? phone : '');
  const cleanPhone = phoneCheck.normalized;
  const cleanEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
  const cleanPassword = typeof password === 'string' ? password : '';
  const cleanCounty = typeof county === 'string' ? county.trim() : '';
  const requestedLang = typeof preferredLanguage === 'string' ? preferredLanguage.trim() : 'en';
  const cleanLang = SUPPORTED_LANGUAGES.some((l) => l.code === requestedLang) ? requestedLang : 'en';
  const cleanCrops = Array.isArray(cropsOfInterest)
    ? cropsOfInterest.filter((c): c is string => typeof c === 'string').slice(0, 10)
    : [];

  if (cleanName.length < 2 || cleanName.length > 80) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Name must be 2 to 80 characters.'}});
    return;
  }
  if (!phoneCheck.valid) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message:
          phoneCheck.error ||
          'Enter a valid Liberian phone number (e.g., 077 012 3456 or +231 77 012 3456).',
      },
    });
    return;
  }
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Enter a valid email address.'}});
    return;
  }
  // Protected demonstration environment: ONLY synthetic test numbers (and no e-mail) so that no real person's contact details are ever stored.
  if (demoEnvironment()) {
    const phoneRefusal = demoPhoneProblem(cleanPhone, 'Your phone number');
    if (phoneRefusal) {
      res.status(422).json({error: {code: 'PHONE_NOT_ALLOWED', message: phoneRefusal}});
      return;
    }
    if (cleanEmail) {
      res.status(422).json({error: {code: 'EMAIL_NOT_ALLOWED', message: 'This is a demonstration site. E-mail addresses are not used here. Please leave the e-mail field empty.'}});
      return;
    }
  }
  const pwProblem = passwordProblem(cleanPassword, {phone: cleanPhone, displayName: cleanName});
  if (pwProblem) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: pwProblem}});
    return;
  }
  if (!LIBERIA_COUNTIES.includes(cleanCounty as (typeof LIBERIA_COUNTIES)[number])) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Select a valid Liberian county.'}});
    return;
  }

  // A number is never reserved just because it was typed once (Decision 8): an UNVERIFIED claim that has expired is released to the new registrant,
  // while a verified number and an unexpired claim are never taken. The verified owner can free a number by proving possession (phone-claim flow).
  // Hash first (non-blocking, may wait for a slot): the uniqueness checks and the INSERT below then run back-to-back with no await between them.
  let passwordHash: string;
  try {
    passwordHash = await hashPasswordAsync(cleanPassword);
  } catch (e) {
    if (e instanceof PasswordBusyError) { res.setHeader('Retry-After', '3'); res.status(503).json({error: {code: 'SERVER_BUSY', message: 'The server is busy. Please try again in a moment.'}}); return; }
    throw e;
  }
  const phoneState = resolvePhoneForRegistration(cleanPhone, req.cookies?.[CLAIM_COOKIE]);
  const existingPhone = phoneState === 'taken';
  if (existingPhone) {
    res.status(409).json({error: {code: 'PHONE_EXISTS', message: 'An account with this phone number already exists.'}});
    return;
  }
  if (cleanEmail) {
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existingEmail) {
      res.status(409).json({error: {code: 'EMAIL_EXISTS', message: 'An account with this email already exists.'}});
      return;
    }
  }

  const farmerRole = db.prepare("SELECT id FROM roles WHERE name = 'farmer'").get() as {id: number};

  db.exec('BEGIN IMMEDIATE;');
  let userId = 0;
  try {
    const resUser = db
      .prepare(`INSERT INTO users (display_name, phone, email, password_hash, status, phone_claim_expires_at)
                VALUES (?, ?, ?, ?, 'active', datetime('now', ?))`)
      .run(cleanName, cleanPhone, cleanEmail, passwordHash, `+${getAuthConfig().unverifiedClaimHoursNew} hours`);
    userId = Number(resUser.lastInsertRowid);

    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, farmerRole.id);
    db.prepare(
      `INSERT INTO farmer_profiles (user_id, county, preferred_language, crops_of_interest)
       VALUES (?, ?, ?, ?)`
    ).run(userId, cleanCounty, cleanLang, JSON.stringify(cleanCrops));
    db.prepare('INSERT INTO language_preferences (user_id, language_code) VALUES (?, ?)').run(userId, cleanLang);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  clearHold(cleanPhone);
  const token = signSessionToken(userId, getSessionVersion(userId) ?? 0);
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(req, true));

  writeAuditLog({
    actorUserId: userId,
    actorRole: 'farmer',
    action: 'farmer_registered',
    targetType: 'user',
    targetId: userId,
    details: {county: cleanCounty},
    ip: req.ip,
  });

  const user = loadUserById(userId);
  res.status(201).json({user});
}));

v1Router.post('/auth/login', asyncRoute(async (req: AuthedRequest, res) => {
  const db = getDb();
  const {identifier, password} = req.body ?? {};
  const rawIdent = typeof identifier === 'string' ? identifier.trim().slice(0, 200) : '';
  const cleanPassword = typeof password === 'string' ? password.slice(0, 256) : '';
  const throttled = () => res.status(429).json({
    error: {code: 'AUTH_THROTTLED', message: 'Too many login attempts. Please wait 15 minutes before trying again.'},
  });

  // 1. Per-address ceiling on FAILED attempts across all accounts. Checked before any work (and before any password hashing).
  const ipKey = hashIdentifier(`login-ip:${clientAddress(req)}`);
  const ipCheck = checkAndRecordRateLimit(ipKey, 'login_ip_fail', loginIpFailMax(), 15, false);
  if (!ipCheck.allowed) {
    res.setHeader('Retry-After', String(ipCheck.retryAfterSeconds ?? 900));
    throttled();
    return;
  }

  // 2. Normalize the identifier BEFORE it is used as a limiter key: "+231 770 000 101", "0770000101" and "+231770000101" are one account.
  const phoneIdent = normalizeLiberianPhone(rawIdent);
  const normalized = rawIdent.includes('@')
    ? rawIdent.toLowerCase()
    : phoneIdent.valid
      ? phoneIdent.normalized
      : normalizePhone(rawIdent);

  // Protected demonstration environment: sign-in with synthetic test numbers only (same rule as everywhere else: server/demoPolicy.ts).
  if (demoEnvironment() && rawIdent && !isSyntheticPhone(normalized)) {
    res.status(422).json({error: {code: 'PHONE_NOT_ALLOWED', message: syntheticOnlyMessage('The phone number')}});
    return;
  }

  const userRow = rawIdent
    ? (db
        .prepare('SELECT id, password_hash, status, phone, phone_verified_at FROM users WHERE phone = ? OR lower(email) = ?')
        .get(normalized, rawIdent.toLowerCase()) as
        | {id: number; password_hash: string; status: string; phone: string; phone_verified_at: string | null}
        | undefined)
    : undefined;

  // 3. Per (address + account) limit. An existing account is keyed by its id, so signing in by phone, by e-mail or with any spelling of the number
  //    shares ONE allowance; an unknown identifier is keyed by its normalized form.
  const subject = userRow ? `u${userRow.id}` : `n:${normalized}`;
  const rateKey = hashIdentifier(`${clientAddress(req)}:${subject}`);
  const rl = checkAndRecordRateLimit(rateKey, 'login_attempt', 8, 15, true);
  if (!rl.allowed) {
    throttled();
    return;
  }

  if (!rawIdent || !cleanPassword) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Phone/email and password are required.'}});
    return;
  }

  // 4. Verify off the event loop. An unknown account is checked against a dummy hash so it costs the same time as a wrong password.
  let passwordOk = false;
  try {
    passwordOk = userRow ? await verifyPasswordAsync(cleanPassword, userRow.password_hash) : await verifyAgainstDummy(cleanPassword);
  } catch (e) {
    if (e instanceof PasswordBusyError) { res.setHeader('Retry-After', '3'); res.status(503).json({error: {code: 'SERVER_BUSY', message: 'The server is busy. Please try again in a moment.'}}); return; }
    throw e;
  }

  if (!userRow || !passwordOk) {
    recordRateLimitAttempt(ipKey, 'login_ip_fail');
    writeAuditLog({
      actorUserId: null,
      actorRole: 'anonymous',
      action: 'login_failed',
      targetType: 'auth',
      details: {identifierHash: hashIdentifier(normalized || rawIdent)},
      ip: req.ip,
    });
    res.status(401).json({error: {code: 'INVALID_CREDENTIALS', message: 'Invalid phone/email or password.'}});
    return;
  }

  if (userRow.status !== 'active') {
    res.status(403).json({error: {code: 'ACCOUNT_INACTIVE', message: 'This account is suspended or inactive.'}});
    return;
  }

  // Password is right. Only a trusted device (valid, unexpired, unrevoked, THIS user's) may receive a session now; anything else must prove
  // possession of the account's phone first. No session cookie is issued until the code is verified.
  if (!findTrustedDevice(userRow.id, req.cookies?.[DEVICE_COOKIE])) {
    if (!hasPhoneOnFile(userRow.phone)) {
      res.status(409).json({error: {code: 'PHONE_RECOVERY_REQUIRED', message: 'This account has no phone number that can receive a code. Please contact the project team for account recovery.'}});
      return;
    }
    const purpose = userRow.phone_verified_at ? 'new_device_login' : 'phone_confirm';
    startChallenge({userId: userRow.id, purpose, phone: userRow.phone, ip: clientAddress(req)})
      .then((started) => {
        res.cookie(CHALLENGE_COOKIE, `${started.publicId}.${started.bindingSecret}`, challengeCookieOptions(req));
        writeAuditLog({actorUserId: userRow.id, actorRole: 'user', action: 'otp_sent', targetType: 'user', targetId: userRow.id, details: {purpose}, ip: req.ip});
        const now = Date.now();
        res.status(202).json({
          status: 'VERIFICATION_REQUIRED',
          purpose,
          maskedPhone: maskPhone(userRow.phone),
          expiresInSeconds: Math.max(0, Math.ceil((started.expiresMs - now) / 1000)),
          resendAfterSeconds: Math.max(0, Math.ceil((started.resendAfterMs - now) / 1000)),
          demo: getSmsProvider().name === 'simulated',
          demoInbox: getAuthConfig().demoInlineInbox && !getAuthConfig().production && getSmsProvider().name === 'simulated',
        });
      })
      .catch((e) => {
        if (e instanceof OtpError) {
          if (e.retryAfterSeconds) res.setHeader('Retry-After', String(e.retryAfterSeconds));
          res.status(e.status).json({error: {code: e.code, message: e.message}});
          return;
        }
        res.status(500).json({error: {code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.'}});
      });
    return;
  }

  const token = signSessionToken(userRow.id, getSessionVersion(userRow.id) ?? 0);
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(req, true));
  const user = loadUserById(userRow.id);

  writeAuditLog({
    actorUserId: userRow.id,
    actorRole: user?.roles.join(',') || 'farmer',
    action: 'login_success',
    targetType: 'user',
    targetId: userRow.id,
    ip: req.ip,
  });

  res.json({user});
}));

v1Router.post('/auth/logout', (req: AuthedRequest, res) => {
  if (req.user) {
    writeAuditLog({
      actorUserId: req.user.id,
      actorRole: req.user.roles.join(','),
      action: 'logout',
      targetType: 'user',
      targetId: req.user.id,
      ip: req.ip,
    });
  }
  res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions(req, true));
  res.json({ok: true});
});

// 5. AI Agricultural Advisor
v1Router.post('/advisor/ask', async (req: AuthedRequest, res) => {
  const db = getDb();
  const {question, cropSlug, topic, languageCode, imageBase64, imageMimeType, conversationHistory} = req.body ?? {};
  if (typeof question !== 'string' || question.trim().length < 5) {
    res.status(400).json({
      error: {code: 'VALIDATION_ERROR', message: 'Please enter a farming question of at least 5 characters.'},
    });
    return;
  }
  if (question.length > 1500) {
    res.status(400).json({
      error: {code: 'PAYLOAD_TOO_LARGE', message: 'Question is too long (maximum 1,500 characters).'},
    });
    return;
  }
  if (imageBase64 !== undefined) {
    const validMime = typeof imageMimeType === 'string' && ['image/jpeg', 'image/png', 'image/webp'].includes(imageMimeType);
    if (typeof imageBase64 !== 'string' || !validMime || imageBase64.length > 3_000_000) {
      res.status(400).json({
        error: {code: 'INVALID_IMAGE', message: 'Uploaded image must be JPEG, PNG, or WebP under 2MB.'},
      });
      return;
    }
  }

  const anonLimit = Number(process.env.AI_ANON_DAILY_LIMIT || 5);
  const authLimit = Number(process.env.AI_AUTH_HOURLY_LIMIT || 30);

  let remainingQuota: number;
  if (req.user) {
    const rl = checkAndRecordRateLimit(`user:${req.user.id}`, 'ai_advisor_ask', authLimit, 60, true);
    if (!rl.allowed) {
      res.status(429).json({
        error: {code: 'RATE_LIMITED', message: 'Hourly AI question limit reached. Try again later or browse offline guides.'},
      });
      return;
    }
    remainingQuota = rl.remaining;
  } else {
    const anonKey = `anon:${req.anonToken || hashIdentifier(clientAddress(req))}`;
    const rl = checkAndRecordRateLimit(anonKey, 'ai_advisor_anon', anonLimit, 60 * 24, true);
    if (!rl.allowed) {
      res.status(429).json({
        error: {
          code: 'ANON_QUOTA_REACHED',
          message: `You have reached the ${anonLimit} free guest AI questions for today. Register or sign in for free to keep asking and save your history.`,
        },
      });
      return;
    }
    remainingQuota = rl.remaining;
  }

  const result = await askAgriculturalAdvisor({
    question,
    cropSlug: typeof cropSlug === 'string' ? cropSlug : undefined,
    topic: typeof topic === 'string' ? topic : undefined,
    county: req.user?.county,
    languageCode: typeof languageCode === 'string' ? languageCode : req.user?.preferredLanguage || 'en',
    imageBase64: typeof imageBase64 === 'string' ? imageBase64 : undefined,
    imageMimeType: typeof imageMimeType === 'string' ? imageMimeType : undefined,
    conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : undefined,
  });

  db.prepare(
    `INSERT INTO advisor_conversations (user_id, anon_token, crop_slug, question_text, answer_json, provider_mode)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    req.user?.id ?? null,
    req.user ? null : req.anonToken ?? null,
    typeof cropSlug === 'string' ? cropSlug : null,
    question.trim().slice(0, 1200),
    JSON.stringify(result),
    result.providerMode
  );

  res.json({
    advisor: result,
    quota: {
      authenticated: Boolean(req.user),
      remaining: remainingQuota,
      limit: req.user ? authLimit : anonLimit,
    },
  });
});

v1Router.get('/advisor/history', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, crop_slug, question_text, answer_json, provider_mode, created_at
       FROM advisor_conversations
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 30`
    )
    .all(req.user!.id) as Array<{
    id: number;
    crop_slug: string | null;
    question_text: string;
    answer_json: string;
    provider_mode: string;
    created_at: string;
  }>;

  const history = rows.map((r) => ({
    id: r.id,
    cropSlug: r.crop_slug,
    questionText: r.question_text,
    answer: JSON.parse(r.answer_json),
    providerMode: r.provider_mode,
    createdAt: r.created_at,
  }));

  res.json({history});
});

v1Router.post('/advisor/save', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const {title, cropName, contentText, sourceType, metadata} = req.body ?? {};
  if (typeof title !== 'string' || !title.trim() || typeof contentText !== 'string' || !contentText.trim()) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Title and advice content are required.'}});
    return;
  }
  const safeSource = ['ai_advisor', 'guide', 'expert'].includes(sourceType) ? sourceType : 'ai_advisor';
  const resInsert = db
    .prepare(
      `INSERT INTO saved_advice (user_id, source_type, title, crop_name, content_text, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user!.id,
      safeSource,
      title.trim().slice(0, 180),
      typeof cropName === 'string' ? cropName.trim().slice(0, 60) : '',
      contentText.trim().slice(0, 8000),
      JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {})
    );

  res.status(201).json({savedId: Number(resInsert.lastInsertRowid)});
});

// 6. Authenticated Farmer Routes (with strict ownership isolation)
v1Router.get('/farmer/saved', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const items = db
    .prepare(
      `SELECT id, source_type, title, crop_name, content_text, metadata_json, created_at
       FROM saved_advice
       WHERE user_id = ?
       ORDER BY id DESC`
    )
    .all(req.user!.id);
  res.json({saved: items});
});

v1Router.delete('/farmer/saved/:id', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT user_id FROM saved_advice WHERE id = ?').get(id) as
    | {user_id: number}
    | undefined;

  if (!existing) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Saved advice not found.'}});
    return;
  }
  if (existing.user_id !== req.user!.id) {
    res.status(403).json({error: {code: 'FORBIDDEN', message: 'You cannot delete another farmer’s saved advice.'}});
    return;
  }
  db.prepare('DELETE FROM saved_advice WHERE id = ? AND user_id = ?').run(id, req.user!.id);
  res.json({ok: true});
});

v1Router.get('/farmer/questions', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const questions = db
    .prepare(
      `SELECT q.id, q.topic, q.county, q.title, q.description, q.status, q.created_at, q.updated_at,
              c.name AS crop_name, c.slug AS crop_slug,
              u.display_name AS expert_name
       FROM advisory_questions q
       LEFT JOIN crops c ON c.id = q.crop_id
       LEFT JOIN users u ON u.id = q.assigned_expert_id
       WHERE q.farmer_id = ?
       ORDER BY q.updated_at DESC, q.id DESC`
    )
    .all(req.user!.id);
  res.json({questions});
});

v1Router.post('/farmer/questions', requireAuth, idempotent('farmer.question.create'), (req: AuthedRequest, res) => {
  const db = getDb();
  const {cropId, topic, county, title, description} = req.body ?? {};
  const cleanTopic = typeof topic === 'string' && topic.trim() ? topic.trim().slice(0, 80) : 'General Farming';
  const cleanCounty =
    typeof county === 'string' && LIBERIA_COUNTIES.includes(county as (typeof LIBERIA_COUNTIES)[number])
      ? county
      : req.user!.county;
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanDesc = typeof description === 'string' ? description.trim() : '';

  if (cleanTitle.length < 5 || cleanTitle.length > 160) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Question title must be 5 to 160 characters.'}});
    return;
  }
  if (cleanDesc.length < 15 || cleanDesc.length > 3000) {
    res.status(400).json({
      error: {code: 'VALIDATION_ERROR', message: 'Problem description must be 15 to 3,000 characters.'},
    });
    return;
  }

  let validCropId: number | null = null;
  if (cropId) {
    const c = db.prepare('SELECT id FROM crops WHERE id = ?').get(Number(cropId)) as {id: number} | undefined;
    if (c) validCropId = c.id;
  }

  db.exec('BEGIN IMMEDIATE;');
  let questionId = 0;
  try {
    const resQ = db
      .prepare(
        `INSERT INTO advisory_questions (farmer_id, crop_id, topic, county, title, description, status)
         VALUES (?, ?, ?, ?, ?, ?, 'Submitted')`
      )
      .run(req.user!.id, validCropId, cleanTopic, cleanCounty, cleanTitle, cleanDesc);
    questionId = Number(resQ.lastInsertRowid);

    db.prepare(
      `INSERT INTO advisory_messages (question_id, sender_id, sender_role, message_text, is_official_expert_advice)
       VALUES (?, ?, 'farmer', ?, 0)`
    ).run(questionId, req.user!.id, cleanDesc);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: 'farmer',
    action: 'question_submitted',
    targetType: 'advisory_question',
    targetId: questionId,
    ip: req.ip,
  });

  res.status(201).json({questionId});
});

v1Router.get('/farmer/questions/:id', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const qId = Number(req.params.id);
  const question = db
    .prepare(
      `SELECT q.*, c.name AS crop_name, u.display_name AS expert_name
       FROM advisory_questions q
       LEFT JOIN crops c ON c.id = q.crop_id
       LEFT JOIN users u ON u.id = q.assigned_expert_id
       WHERE q.id = ?`
    )
    .get(qId) as Record<string, unknown> | undefined;

  if (!question) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Question not found.'}});
    return;
  }
  if (question.farmer_id !== req.user!.id && !req.user!.roles.includes('admin')) {
    res.status(403).json({error: {code: 'FORBIDDEN', message: 'Access denied to this question.'}});
    return;
  }

  const messages = db
    .prepare(
      `SELECT m.id, m.sender_role, m.message_text, m.is_official_expert_advice, m.created_at,
              u.display_name AS sender_name
       FROM advisory_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.question_id = ?
       ORDER BY m.id ASC`
    )
    .all(qId);

  res.json({question, messages});
});

v1Router.post('/farmer/questions/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const qId = Number(req.params.id);
  const {messageText} = req.body ?? {};
  if (typeof messageText !== 'string' || messageText.trim().length < 3 || messageText.length > 2000) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Message must be 3 to 2,000 characters.'}});
    return;
  }

  const question = db.prepare('SELECT id, farmer_id, status FROM advisory_questions WHERE id = ?').get(qId) as
    | {id: number; farmer_id: number; status: string}
    | undefined;
  if (!question) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Question not found.'}});
    return;
  }
  if (question.farmer_id !== req.user!.id) {
    res.status(403).json({error: {code: 'FORBIDDEN', message: 'Access denied.'}});
    return;
  }
  if (question.status === 'Closed') {
    res.status(400).json({error: {code: 'QUESTION_CLOSED', message: 'Closed questions cannot receive replies.'}});
    return;
  }

  db.prepare(
    `INSERT INTO advisory_messages (question_id, sender_id, sender_role, message_text, is_official_expert_advice)
     VALUES (?, ?, 'farmer', ?, 0)`
  ).run(qId, req.user!.id, messageText.trim());
  db.prepare("UPDATE advisory_questions SET updated_at = datetime('now') WHERE id = ?").run(qId);

  res.status(201).json({ok: true});
});

// 7. Profile & Language Preferences
v1Router.get('/profile', requireAuth, (req: AuthedRequest, res) => {
  res.json({profile: req.user});
});

v1Router.patch('/profile', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const {displayName, county, preferredLanguage, cropsOfInterest} = req.body ?? {};
  const cleanName = typeof displayName === 'string' && displayName.trim().length >= 2 ? displayName.trim() : req.user!.displayName;
  const cleanCounty =
    typeof county === 'string' && LIBERIA_COUNTIES.includes(county as (typeof LIBERIA_COUNTIES)[number])
      ? county
      : req.user!.county;
  const validLangCodes = SUPPORTED_LANGUAGES.map((l) => l.code) as readonly string[];
  const cleanLang =
    typeof preferredLanguage === 'string' && validLangCodes.includes(preferredLanguage)
      ? preferredLanguage
      : req.user!.preferredLanguage;
  const cleanCrops = Array.isArray(cropsOfInterest)
    ? cropsOfInterest.filter((c): c is string => typeof c === 'string').slice(0, 10)
    : req.user!.cropsOfInterest;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare("UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?").run(
      cleanName,
      req.user!.id
    );
    db.prepare(
      `INSERT INTO farmer_profiles (user_id, county, preferred_language, crops_of_interest, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         county = excluded.county,
         preferred_language = excluded.preferred_language,
         crops_of_interest = excluded.crops_of_interest,
         updated_at = datetime('now')`
    ).run(req.user!.id, cleanCounty, cleanLang, JSON.stringify(cleanCrops));
    db.prepare(
      `INSERT INTO language_preferences (user_id, language_code, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET language_code = excluded.language_code, updated_at = datetime('now')`
    ).run(req.user!.id, cleanLang);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  res.json({user: loadUserById(req.user!.id)});
});

// 8. Public Contact / Feedback
v1Router.post('/feedback', (req: AuthedRequest, res) => {
  const db = getDb();
  const rl = checkAndRecordRateLimit(hashIdentifier(clientAddress(req)), 'feedback_submit', 8, 60, true);
  if (!rl.allowed) {
    res.status(429).json({error: {code: 'RATE_LIMITED', message: 'Too many feedback submissions. Please wait.'}});
    return;
  }

  const {name, contactInfo, county, category, message} = req.body ?? {};
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanMsg = typeof message === 'string' ? message.trim() : '';
  if (cleanName.length < 2 || cleanMsg.length < 10) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Name and message (10+ characters) are required.'}});
    return;
  }

  const resIns = db
    .prepare(
      `INSERT INTO feedback (user_id, name, contact_info, county, category, message)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user?.id ?? null,
      cleanName.slice(0, 100),
      typeof contactInfo === 'string' ? contactInfo.trim().slice(0, 120) : '',
      typeof county === 'string' ? county.trim().slice(0, 50) : '',
      typeof category === 'string' ? category.trim().slice(0, 40) : 'general',
      cleanMsg.slice(0, 2000)
    );

  res.status(201).json({feedbackId: Number(resIns.lastInsertRowid)});
});

// 9. Expert Routes (server-enforced approved expert role; never exposes farmer phone/email)
v1Router.get('/expert/questions', requireRole('expert', 'admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const isAdmin = req.user!.roles.includes('admin');
  const rows = db
    .prepare(
      `SELECT q.id, q.topic, q.county, q.title, q.description, q.status, q.created_at, q.updated_at,
              c.name AS crop_name, f.display_name AS farmer_name
       FROM advisory_questions q
       LEFT JOIN crops c ON c.id = q.crop_id
       JOIN users f ON f.id = q.farmer_id
       ${isAdmin ? '' : 'WHERE q.assigned_expert_id = ?'}
       ORDER BY q.updated_at DESC, q.id DESC`
    )
    .all(...(isAdmin ? [] : [req.user!.id]));

  res.json({questions: rows});
});

v1Router.get('/expert/questions/:id', requireRole('expert', 'admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const qId = Number(req.params.id);
  const isAdmin = req.user!.roles.includes('admin');

  const question = db
    .prepare(
      `SELECT q.id, q.farmer_id, q.topic, q.county, q.title, q.description, q.status,
              q.assigned_expert_id, q.created_at, q.updated_at,
              c.name AS crop_name, f.display_name AS farmer_name
       FROM advisory_questions q
       LEFT JOIN crops c ON c.id = q.crop_id
       JOIN users f ON f.id = q.farmer_id
       WHERE q.id = ?`
    )
    .get(qId) as Record<string, unknown> | undefined;

  if (!question) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Assigned question not found.'}});
    return;
  }
  if (!isAdmin && question.assigned_expert_id !== req.user!.id) {
    res.status(403).json({error: {code: 'FORBIDDEN', message: 'You are not assigned to this question.'}});
    return;
  }

  const messages = db
    .prepare(
      `SELECT m.id, m.sender_role, m.message_text, m.is_official_expert_advice, m.created_at,
              u.display_name AS sender_name
       FROM advisory_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.question_id = ?
       ORDER BY m.id ASC`
    )
    .all(qId);

  res.json({question, messages});
});

v1Router.post('/expert/questions/:id/respond', requireRole('expert', 'admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const qId = Number(req.params.id);
  const isAdmin = req.user!.roles.includes('admin');
  const {messageText, status} = req.body ?? {};

  if (typeof messageText !== 'string' || messageText.trim().length < 10 || messageText.length > 3000) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Response must be 10 to 3,000 characters.'}});
    return;
  }
  const allowedNext = ['Answered', 'Awaiting Clarification', 'Closed'];
  const nextStatus = allowedNext.includes(status) ? status : 'Answered';

  const question = db
    .prepare('SELECT id, assigned_expert_id FROM advisory_questions WHERE id = ?')
    .get(qId) as {id: number; assigned_expert_id: number | null} | undefined;
  if (!question) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Question not found.'}});
    return;
  }
  if (!isAdmin && question.assigned_expert_id !== req.user!.id) {
    res.status(403).json({error: {code: 'FORBIDDEN', message: 'Only the assigned approved expert may reply.'}});
    return;
  }

  const isOfficial = req.user!.roles.includes('expert') && req.user!.expertStatus === 'approved' ? 1 : 0;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO advisory_messages (question_id, sender_id, sender_role, message_text, is_official_expert_advice)
       VALUES (?, ?, 'expert', ?, ?)`
    ).run(qId, req.user!.id, messageText.trim(), isOfficial);

    db.prepare("UPDATE advisory_questions SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      nextStatus,
      qId
    );
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: 'expert',
    action: 'expert_responded',
    targetType: 'advisory_question',
    targetId: qId,
    details: {nextStatus},
    ip: req.ip,
  });

  res.status(201).json({ok: true, status: nextStatus});
});

v1Router.patch('/expert/profile', requireRole('expert'), (req: AuthedRequest, res) => {
  const db = getDb();
  const {specialty, county, bio} = req.body ?? {};
  const cleanSpecialty = typeof specialty === 'string' && specialty.trim() ? specialty.trim().slice(0, 120) : undefined;
  const cleanCounty =
    typeof county === 'string' && LIBERIA_COUNTIES.includes(county as (typeof LIBERIA_COUNTIES)[number])
      ? county
      : undefined;
  const cleanBio = typeof bio === 'string' ? bio.trim().slice(0, 800) : undefined;

  db.prepare(
    `UPDATE expert_profiles
     SET specialty = COALESCE(?, specialty),
         county = COALESCE(?, county),
         bio = COALESCE(?, bio)
     WHERE user_id = ?`
  ).run(cleanSpecialty ?? null, cleanCounty ?? null, cleanBio ?? null, req.user!.id);

  res.json({user: loadUserById(req.user!.id)});
});

// 10. Administrator Routes (strictly server-enforced RBAC)
v1Router.get('/admin/overview', requireRole('admin'), (_req, res) => {
  const db = getDb();
  const farmers = db
    .prepare("SELECT COUNT(*) as c FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'farmer'")
    .get() as {c: number};
  const experts = db.prepare('SELECT COUNT(*) as c FROM expert_profiles').get() as {c: number};
  const guidesPublished = db
    .prepare("SELECT COUNT(*) as c FROM agricultural_guides WHERE is_published = 1 AND review_status = 'approved'")
    .get() as {c: number};
  const guidesPending = db
    .prepare("SELECT COUNT(*) as c FROM agricultural_guides WHERE review_status = 'pending_review'")
    .get() as {c: number};
  const questionsOpen = db
    .prepare("SELECT COUNT(*) as c FROM advisory_questions WHERE status IN ('Submitted','Assigned','Awaiting Clarification')")
    .get() as {c: number};
  const feedbackNew = db.prepare("SELECT COUNT(*) as c FROM feedback WHERE status = 'new'").get() as {c: number};

  const recentAudits = db
    .prepare(
      `SELECT a.id, a.actor_role, a.action, a.target_type, a.target_id, a.created_at, u.display_name AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.id DESC
       LIMIT 10`
    )
    .all();

  res.json({
    metrics: {
      farmers: farmers.c,
      experts: experts.c,
      guidesPublished: guidesPublished.c,
      guidesPending: guidesPending.c,
      questionsOpen: questionsOpen.c,
      feedbackNew: feedbackNew.c,
    },
    recentAudits,
  });
});

v1Router.get('/admin/users', requireRole('admin'), (_req, res) => {
  const db = getDb();
  const users = db
    .prepare(
      `SELECT u.id, u.display_name, u.phone, u.email, u.status, u.created_at,
              fp.county, fp.preferred_language,
              GROUP_CONCAT(r.name) AS roles
       FROM users u
       LEFT JOIN farmer_profiles fp ON fp.user_id = u.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY u.id DESC`
    )
    .all();
  res.json({users});
});

v1Router.patch('/admin/users/:id/status', requireRole('admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const targetId = Number(req.params.id);
  const {status} = req.body ?? {};
  if (!['active', 'suspended'].includes(status)) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Invalid status.'}});
    return;
  }
  if (targetId === req.user!.id && status === 'suspended') {
    res.status(400).json({error: {code: 'CANNOT_SELF_SUSPEND', message: 'Cannot suspend your own admin account.'}});
    return;
  }
  db.prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, targetId);
  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: 'admin',
    action: 'user_status_changed',
    targetType: 'user',
    targetId,
    details: {status},
    ip: req.ip,
  });
  res.json({ok: true});
});

v1Router.get('/admin/experts', requireRole('admin'), (_req, res) => {
  const db = getDb();
  const experts = db
    .prepare(
      `SELECT u.id, u.display_name, u.phone, u.email, u.status AS account_status,
              ep.specialty, ep.county, ep.bio, ep.approval_status, ep.approved_at
       FROM expert_profiles ep
       JOIN users u ON u.id = ep.user_id
       ORDER BY u.id DESC`
    )
    .all();
  res.json({experts});
});

v1Router.post('/admin/experts', requireRole('admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const {displayName, phone, email, password, specialty, county, bio} = req.body ?? {};
  const cleanName = typeof displayName === 'string' ? displayName.trim() : '';
  const cleanPhone = typeof phone === 'string' ? normalizePhone(phone) : '';
  const cleanPassword = typeof password === 'string' ? password : '';
  const cleanSpecialty = typeof specialty === 'string' ? specialty.trim() : '';
  const cleanCounty =
    typeof county === 'string' && LIBERIA_COUNTIES.includes(county as (typeof LIBERIA_COUNTIES)[number])
      ? county
      : 'Montserrado';

  if (cleanName.length < 2 || !/^\+?[0-9]{7,15}$/.test(cleanPhone) || cleanPassword.length < 8 || !cleanSpecialty) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Valid name, phone, password (8+ chars), and specialty required.'}});
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone);
  if (existing) {
    res.status(409).json({error: {code: 'PHONE_EXISTS', message: 'Phone number already registered.'}});
    return;
  }

  const expertRole = db.prepare("SELECT id FROM roles WHERE name = 'expert'").get() as {id: number};
  let expertId = 0;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const resUser = db
      .prepare("INSERT INTO users (display_name, phone, email, password_hash, status) VALUES (?, ?, ?, ?, 'active')")
      .run(
        cleanName,
        cleanPhone,
        typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null,
        hashPassword(cleanPassword)
      );
    expertId = Number(resUser.lastInsertRowid);
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(expertId, expertRole.id);
    db.prepare(
      `INSERT INTO expert_profiles (user_id, specialty, county, bio, approval_status, approved_by, approved_at)
       VALUES (?, ?, ?, ?, 'approved', ?, datetime('now'))`
    ).run(expertId, cleanSpecialty, cleanCounty, typeof bio === 'string' ? bio.trim() : '', req.user!.id);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: 'admin',
    action: 'expert_created',
    targetType: 'user',
    targetId: expertId,
    details: {specialty: cleanSpecialty, county: cleanCounty},
    ip: req.ip,
  });

  res.status(201).json({expertId});
});

v1Router.patch('/admin/experts/:id/status', requireRole('admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const targetId = Number(req.params.id);
  const {approvalStatus} = req.body ?? {};
  if (!['pending', 'approved', 'suspended'].includes(approvalStatus)) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Invalid approval status.'}});
    return;
  }

  db.prepare(
    `UPDATE expert_profiles
     SET approval_status = ?,
         approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
         approved_at = CASE WHEN ? = 'approved' THEN datetime('now') ELSE approved_at END
     WHERE user_id = ?`
  ).run(approvalStatus, approvalStatus, req.user!.id, approvalStatus, targetId);

  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: 'admin',
    action: 'expert_status_updated',
    targetType: 'expert',
    targetId,
    details: {approvalStatus},
    ip: req.ip,
  });

  res.json({ok: true});
});

v1Router.get('/admin/guides', requireRole('admin'), (_req, res) => {
  const db = getDb();
  const guides = db
    .prepare(
      `SELECT g.*, c.name AS crop_name, cat.name AS category_name
       FROM agricultural_guides g
       JOIN crops c ON c.id = g.crop_id
       JOIN guide_categories cat ON cat.id = g.category_id
       ORDER BY g.id DESC`
    )
    .all();
  res.json({guides});
});

v1Router.post('/admin/guides', requireRole('admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const {cropId, categoryId, title, summary, contentMarkdown, sourceAttribution, isPestDisease, isSampleDemo} =
    req.body ?? {};

  if (!cropId || !categoryId || typeof title !== 'string' || title.trim().length < 5 || typeof contentMarkdown !== 'string') {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Crop, category, title, and content are required.'}});
    return;
  }

  const slugBase = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const slug = `${slugBase}-${Date.now().toString(36)}`;
  const cropRow = db.prepare('SELECT image_url FROM crops WHERE id = ?').get(Number(cropId)) as
    | {image_url: string}
    | undefined;

  const ins = db
    .prepare(
      `INSERT INTO agricultural_guides (
        slug, crop_id, category_id, title, summary, content_markdown, image_url,
        source_attribution, is_sample_demo, is_pest_disease, review_status, is_published, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', 0, ?)`
    )
    .run(
      slug,
      Number(cropId),
      Number(categoryId),
      title.trim(),
      typeof summary === 'string' && summary.trim() ? summary.trim() : title.trim(),
      contentMarkdown.trim(),
      cropRow?.image_url || '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
      typeof sourceAttribution === 'string' && sourceAttribution.trim()
        ? sourceAttribution.trim()
        : 'Team 8 Internal Draft (Pending Agronomist Review)',
      isSampleDemo === false ? 0 : 1,
      isPestDisease ? 1 : 0,
      req.user!.id
    );

  const guideId = Number(ins.lastInsertRowid);
  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: 'admin',
    action: 'guide_created',
    targetType: 'agricultural_guide',
    targetId: guideId,
    details: {title: title.trim()},
    ip: req.ip,
  });

  res.status(201).json({guideId, slug});
});

v1Router.post('/admin/guides/:id/review', requireRole('admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const guideId = Number(req.params.id);
  const {decision, notes, publish} = req.body ?? {};
  if (!['approved', 'changes_requested', 'unpublished'].includes(decision)) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Invalid review decision.'}});
    return;
  }

  const nextStatus = decision === 'approved' ? 'approved' : decision === 'changes_requested' ? 'changes_requested' : 'pending_review';
  const nextPub = decision === 'approved' && publish !== false ? 1 : 0;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `UPDATE agricultural_guides
       SET review_status = ?,
           is_published = ?,
           reviewed_by_user_id = ?,
           reviewed_by_name = ?,
           last_reviewed_at = datetime('now'),
           version = CASE WHEN ? = 'approved' THEN version + 1 ELSE version END,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(nextStatus, nextPub, req.user!.id, req.user!.displayName, decision, guideId);

    db.prepare(
      'INSERT INTO guide_reviews (guide_id, reviewer_id, decision, notes) VALUES (?, ?, ?, ?)'
    ).run(guideId, req.user!.id, decision, typeof notes === 'string' ? notes.trim() : '');
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: 'admin',
    action: 'guide_reviewed',
    targetType: 'agricultural_guide',
    targetId: guideId,
    details: {decision, published: Boolean(nextPub)},
    ip: req.ip,
  });

  res.json({ok: true, reviewStatus: nextStatus, isPublished: Boolean(nextPub)});
});

v1Router.get('/admin/questions', requireRole('admin'), (_req, res) => {
  const db = getDb();
  const questions = db
    .prepare(
      `SELECT q.id, q.topic, q.county, q.title, q.status, q.assigned_expert_id, q.created_at, q.updated_at,
              c.name AS crop_name, f.display_name AS farmer_name, e.display_name AS expert_name
       FROM advisory_questions q
       LEFT JOIN crops c ON c.id = q.crop_id
       JOIN users f ON f.id = q.farmer_id
       LEFT JOIN users e ON e.id = q.assigned_expert_id
       ORDER BY q.id DESC`
    )
    .all();
  res.json({questions, validStatuses: QUESTION_STATUSES});
});

v1Router.post('/admin/questions/:id/assign', requireRole('admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const qId = Number(req.params.id);
  const {expertId} = req.body ?? {};
  const expert = db
    .prepare("SELECT user_id FROM expert_profiles WHERE user_id = ? AND approval_status = 'approved'")
    .get(Number(expertId)) as {user_id: number} | undefined;

  if (!expert) {
    res.status(400).json({error: {code: 'INVALID_EXPERT', message: 'Selected expert is not approved.'}});
    return;
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      "UPDATE advisory_questions SET assigned_expert_id = ?, status = 'Assigned', updated_at = datetime('now') WHERE id = ?"
    ).run(expert.user_id, qId);
    db.prepare('INSERT INTO expert_assignments (question_id, expert_id, assigned_by) VALUES (?, ?, ?)').run(
      qId,
      expert.user_id,
      req.user!.id
    );
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: 'admin',
    action: 'question_assigned',
    targetType: 'advisory_question',
    targetId: qId,
    details: {expertId: expert.user_id},
    ip: req.ip,
  });

  res.json({ok: true});
});

v1Router.get('/admin/feedback', requireRole('admin'), (_req, res) => {
  const db = getDb();
  const feedback = db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 100').all();
  res.json({feedback});
});

v1Router.get('/admin/audit-logs', requireRole('admin'), (_req, res) => {
  const db = getDb();
  const logs = db
    .prepare(
      `SELECT a.*, u.display_name AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.id DESC
       LIMIT 100`
    )
    .all();
  res.json({logs});
});

v1Router.get('/admin/settings', requireRole('admin'), (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value, updated_at FROM platform_settings ORDER BY key ASC').all();
  res.json({settings: rows});
});

v1Router.patch('/admin/settings', requireRole('admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const updates = req.body?.settings;
  if (!updates || typeof updates !== 'object') {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Settings object required.'}});
    return;
  }

  const allowedKeys = [
    'platform_name',
    'anon_ai_daily_limit',
    'auth_ai_hourly_limit',
    'allow_public_registration',
    'default_language',
    'liberian_english_mode',
    'daily_tip_title',
    'daily_tip_body',
  ];

  const stmt = db.prepare(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );

  for (const [k, v] of Object.entries(updates)) {
    if (allowedKeys.includes(k) && typeof v === 'string') {
      stmt.run(k, v.slice(0, 600));
    }
  }

  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: 'admin',
    action: 'settings_updated',
    targetType: 'platform_settings',
    details: {keys: Object.keys(updates).filter((k) => allowedKeys.includes(k))},
    ip: req.ip,
  });

  const rows = db.prepare('SELECT key, value, updated_at FROM platform_settings ORDER BY key ASC').all();
  res.json({settings: rows});
});
