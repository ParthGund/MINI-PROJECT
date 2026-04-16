-- ============================================================
--  RailConnect – Saved Passengers Table
--  Run this after schema.sql to add passenger profile support.
--  Usage:  mysql -u root -p railconnect < db/passengers_schema.sql
-- ============================================================

USE railconnect;

CREATE TABLE IF NOT EXISTS saved_passengers (
  id               INT          NOT NULL AUTO_INCREMENT,
  user_id          INT          NOT NULL,
  name             VARCHAR(120) NOT NULL,
  age              INT          NOT NULL,
  gender           ENUM('male','female','other') NOT NULL DEFAULT 'male',
  berth_preference VARCHAR(30)  NULL DEFAULT NULL,
  is_primary       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_saved_pax_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
