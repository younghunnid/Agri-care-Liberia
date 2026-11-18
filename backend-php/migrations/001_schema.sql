-- 001_schema.sql — Agri-Advisory Liberia, MySQL 8.0 / MariaDB 10.4+ portable schema (M2).
-- Translation of the 26 data tables of the Node/SQLite reference (server/migrations 001-006). The 27th table, schema_migrations,
-- is the migration ledger and is created by the runner (backend-php/app/Migrations/Runner.php).
-- Rules (enforced by the migration linter): InnoDB + utf8mb4 + utf8mb4_unicode_ci on every table; DATETIME(3) UTC, never TIMESTAMP;
-- no ON UPDATE on any modification timestamp (updated_at is set by application code only on real edits, so a view-count update never changes it);
-- JSON stored as LONGTEXT with CHECK (JSON_VALID(...)), NULL-tolerant where the column is nullable; no literal defaults on TEXT columns;
-- lowercase identifiers, no reserved words (SQLite platform_settings.key is setting_key here). Forward-only: no DROP statements.

CREATE TABLE roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(40) NOT NULL,
  description VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  display_name VARCHAR(120) NOT NULL,
  phone VARCHAR(24) NOT NULL,
  email VARCHAR(190) NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active','suspended','pending') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role_id (role_id),
  CONSTRAINT fk_user_roles_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role_id FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE farmer_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  county VARCHAR(40) NOT NULL,
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
  crops_of_interest LONGTEXT NOT NULL DEFAULT ('[]'),
  farm_notes TEXT NULL DEFAULT (''),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT ck_farmer_profiles_crops_json CHECK (JSON_VALID(crops_of_interest)),
  CONSTRAINT fk_farmer_profiles_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expert_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  specialty VARCHAR(160) NOT NULL,
  county VARCHAR(40) NOT NULL,
  bio TEXT NOT NULL DEFAULT (''),
  approval_status ENUM('pending','approved','suspended') NOT NULL DEFAULT 'pending',
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME(3) NULL,
  PRIMARY KEY (user_id),
  KEY idx_expert_profiles_approved_by (approved_by),
  CONSTRAINT fk_expert_profiles_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_expert_profiles_approved_by FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE language_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(10) NOT NULL DEFAULT 'en',
  tts_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_language_preferences_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE crops (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  local_names VARCHAR(255) NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  season_note TEXT NOT NULL,
  image_url TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crops_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE guide_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_guide_categories_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE agricultural_guides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(120) NOT NULL,
  crop_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  content_markdown MEDIUMTEXT NOT NULL,
  image_url TEXT NOT NULL,
  language_code VARCHAR(10) NOT NULL DEFAULT 'en',
  source_attribution TEXT NOT NULL,
  is_sample_demo TINYINT(1) NOT NULL DEFAULT 1,
  is_pest_disease TINYINT(1) NOT NULL DEFAULT 0,
  review_status ENUM('draft','pending_review','approved','changes_requested') NOT NULL DEFAULT 'pending_review',
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  reviewed_by_name VARCHAR(120) NULL,
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  last_reviewed_at DATETIME(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  offline_available TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_agricultural_guides_slug (slug),
  KEY idx_guides_public (is_published, review_status, crop_id, category_id),
  KEY idx_agricultural_guides_category_id (category_id),
  KEY idx_agricultural_guides_reviewed_by_user_id (reviewed_by_user_id),
  KEY idx_agricultural_guides_created_by (created_by),
  CONSTRAINT fk_agricultural_guides_crop_id FOREIGN KEY (crop_id) REFERENCES crops (id) ON DELETE RESTRICT,
  CONSTRAINT fk_agricultural_guides_category_id FOREIGN KEY (category_id) REFERENCES guide_categories (id) ON DELETE RESTRICT,
  CONSTRAINT fk_agricultural_guides_reviewed_by_user_id FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_agricultural_guides_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE guide_translations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  guide_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(10) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  content_markdown MEDIUMTEXT NOT NULL,
  translation_status ENUM('draft','reviewed','rejected') NOT NULL DEFAULT 'draft',
  reviewed_by VARCHAR(120) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_guide_translations_guide_lang (guide_id, language_code),
  CONSTRAINT fk_guide_translations_guide_id FOREIGN KEY (guide_id) REFERENCES agricultural_guides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE guide_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  guide_id BIGINT UNSIGNED NOT NULL,
  reviewer_id BIGINT UNSIGNED NULL,
  decision ENUM('approved','changes_requested','unpublished') NOT NULL,
  notes TEXT NOT NULL DEFAULT (''),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_guide_reviews_guide_id (guide_id),
  KEY idx_guide_reviews_reviewer_id (reviewer_id),
  CONSTRAINT fk_guide_reviews_guide_id FOREIGN KEY (guide_id) REFERENCES agricultural_guides (id) ON DELETE CASCADE,
  CONSTRAINT fk_guide_reviews_reviewer_id FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE advisory_questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  farmer_id BIGINT UNSIGNED NOT NULL,
  crop_id BIGINT UNSIGNED NULL,
  topic VARCHAR(80) NOT NULL,
  county VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('Submitted','Assigned','Awaiting Clarification','Answered','Closed') NOT NULL DEFAULT 'Submitted',
  assigned_expert_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_questions_farmer (farmer_id, status),
  KEY idx_questions_expert (assigned_expert_id, status),
  KEY idx_advisory_questions_crop_id (crop_id),
  CONSTRAINT fk_advisory_questions_farmer_id FOREIGN KEY (farmer_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_advisory_questions_crop_id FOREIGN KEY (crop_id) REFERENCES crops (id) ON DELETE SET NULL,
  CONSTRAINT fk_advisory_questions_assigned_expert_id FOREIGN KEY (assigned_expert_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE advisory_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  sender_role ENUM('farmer','expert','admin') NOT NULL,
  message_text TEXT NOT NULL,
  is_official_expert_advice TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_advisory_messages_question_id (question_id),
  KEY idx_advisory_messages_sender_id (sender_id),
  CONSTRAINT fk_advisory_messages_question_id FOREIGN KEY (question_id) REFERENCES advisory_questions (id) ON DELETE CASCADE,
  CONSTRAINT fk_advisory_messages_sender_id FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expert_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  expert_id BIGINT UNSIGNED NOT NULL,
  assigned_by BIGINT UNSIGNED NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_expert_assignments_question_id (question_id),
  KEY idx_expert_assignments_expert_id (expert_id),
  KEY idx_expert_assignments_assigned_by (assigned_by),
  CONSTRAINT fk_expert_assignments_question_id FOREIGN KEY (question_id) REFERENCES advisory_questions (id) ON DELETE CASCADE,
  CONSTRAINT fk_expert_assignments_expert_id FOREIGN KEY (expert_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_expert_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE advisor_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  anon_token VARCHAR(80) NULL,
  crop_slug VARCHAR(80) NULL,
  question_text TEXT NOT NULL,
  answer_json LONGTEXT NOT NULL,
  provider_mode VARCHAR(40) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_advisor_conversations_user_id (user_id, created_at),
  CONSTRAINT ck_advisor_conversations_answer_json CHECK (JSON_VALID(answer_json)),
  CONSTRAINT fk_advisor_conversations_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE saved_advice (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  source_type ENUM('ai_advisor','guide','expert') NOT NULL,
  title VARCHAR(255) NOT NULL,
  crop_name VARCHAR(120) NULL DEFAULT '',
  content_text MEDIUMTEXT NOT NULL,
  metadata_json LONGTEXT NOT NULL DEFAULT ('{}'),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_saved_advice_user_id (user_id),
  CONSTRAINT ck_saved_advice_metadata_json CHECK (JSON_VALID(metadata_json)),
  CONSTRAINT fk_saved_advice_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  contact_info VARCHAR(255) NULL DEFAULT '',
  county VARCHAR(40) NULL DEFAULT '',
  category VARCHAR(60) NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  status ENUM('new','reviewed') NOT NULL DEFAULT 'new',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_feedback_user_id (user_id),
  CONSTRAINT fk_feedback_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_resets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_password_resets_user_id (user_id),
  KEY idx_password_resets_token_hash (token_hash),
  CONSTRAINT fk_password_resets_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rate_limit_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rate_key VARCHAR(100) NOT NULL,
  action_type VARCHAR(60) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rate_limit_lookup (rate_key, action_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  actor_role VARCHAR(40) NULL DEFAULT 'system',
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(80) NOT NULL,
  target_id VARCHAR(80) NULL DEFAULT '',
  details_json LONGTEXT NOT NULL DEFAULT ('{}'),
  ip_hash VARCHAR(64) NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_logs_actor_user_id (actor_user_id),
  KEY idx_audit_logs_action_created (action, created_at),
  CONSTRAINT ck_audit_logs_details_json CHECK (JSON_VALID(details_json)),
  CONSTRAINT fk_audit_logs_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_settings (
  setting_key VARCHAR(80) NOT NULL,
  value TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE marketplace_listings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  seller_user_id BIGINT UNSIGNED NULL,
  owner_token VARCHAR(80) NOT NULL DEFAULT '',
  owner_key_hash VARCHAR(64) NOT NULL DEFAULT '',
  seller_name VARCHAR(80) NOT NULL,
  farm_name VARCHAR(80) NOT NULL DEFAULT '',
  category VARCHAR(40) NOT NULL,
  product_name VARCHAR(100) NOT NULL,
  quantity VARCHAR(40) NOT NULL,
  unit VARCHAR(40) NOT NULL,
  price_lrd BIGINT NOT NULL,
  county VARCHAR(40) NOT NULL,
  town VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  image_url MEDIUMTEXT NOT NULL,
  availability_status ENUM('Available','Limited Stock','Sold Out') NOT NULL DEFAULT 'Available',
  seller_phone VARCHAR(30) NOT NULL DEFAULT '',
  phone_consent TINYINT(1) NOT NULL DEFAULT 0,
  phone_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_fictional_seller TINYINT(1) NOT NULL DEFAULT 1,
  view_count INT NOT NULL DEFAULT 0,
  is_demo_listing TINYINT(1) NOT NULL DEFAULT 1,
  moderation_status ENUM('approved','flagged','hidden') NOT NULL DEFAULT 'approved',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_marketplace_filter (moderation_status, category, county),
  KEY idx_marketplace_listings_seller_user_id (seller_user_id),
  CONSTRAINT fk_marketplace_listings_seller_user_id FOREIGN KEY (seller_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE marketplace_inquiries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id BIGINT UNSIGNED NOT NULL,
  buyer_user_id BIGINT UNSIGNED NULL,
  buyer_token VARCHAR(80) NOT NULL DEFAULT '',
  buyer_name VARCHAR(80) NOT NULL,
  buyer_phone VARCHAR(30) NOT NULL DEFAULT '',
  buyer_county VARCHAR(40) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('New','Farmer Replied','Closed') NOT NULL DEFAULT 'New',
  farmer_reply TEXT NULL DEFAULT (''),
  is_demo_inquiry TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_marketplace_inquiries_listing_id (listing_id),
  KEY idx_marketplace_inquiries_buyer_user_id (buyer_user_id),
  CONSTRAINT fk_marketplace_inquiries_listing_id FOREIGN KEY (listing_id) REFERENCES marketplace_listings (id) ON DELETE CASCADE,
  CONSTRAINT fk_marketplace_inquiries_buyer_user_id FOREIGN KEY (buyer_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE local_language_recordings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  language_code ENUM('en','bas','man','kpe','lre') NOT NULL,
  topic_slug VARCHAR(60) NOT NULL,
  topic_label VARCHAR(80) NOT NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  local_phrase_gloss TEXT NOT NULL DEFAULT (''),
  audio_data_url MEDIUMTEXT NULL DEFAULT (''),
  speaker_name VARCHAR(120) NOT NULL,
  consent_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  review_status ENUM('reviewed','pending_review','needs_rerecording') NOT NULL DEFAULT 'pending_review',
  is_sample_demo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_local_language_recordings_public (review_status, language_code, topic_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE demo_expert_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  requester_token VARCHAR(80) NOT NULL DEFAULT '',
  requester_key_hash VARCHAR(64) NOT NULL DEFAULT '',
  farmer_name VARCHAR(80) NOT NULL,
  category VARCHAR(80) NOT NULL,
  county VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  photo_data_url MEDIUMTEXT NULL DEFAULT (''),
  voice_note_data_url MEDIUMTEXT NULL DEFAULT (''),
  voice_note_summary TEXT NULL DEFAULT (''),
  status ENUM('Submitted','Assigned','Answered') NOT NULL DEFAULT 'Submitted',
  assigned_expert_name VARCHAR(120) NULL DEFAULT 'Demo Extension Queue (Simulated)',
  expert_reply TEXT NULL DEFAULT (''),
  is_simulated_demo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_demo_expert_requests_user_id (user_id),
  KEY idx_demo_expert_requests_key_hash (requester_key_hash),
  CONSTRAINT fk_demo_expert_requests_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sync_operations (
  actor VARCHAR(100) NOT NULL,
  op_key VARCHAR(100) NOT NULL,
  kind VARCHAR(64) NOT NULL,
  status_code SMALLINT UNSIGNED NOT NULL,
  response_json LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (actor, op_key),
  KEY idx_sync_operations_created (created_at),
  CONSTRAINT ck_sync_operations_response_json CHECK (JSON_VALID(response_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
