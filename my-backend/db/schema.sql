-- ============================================================
--  RailConnect – MySQL Database Schema
--  Run this script once to create the database and all tables.
--  Usage:  mysql -u root -p < db/schema.sql
-- ============================================================

-- Create the database (skip if already exists)
CREATE DATABASE IF NOT EXISTS railconnect
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE railconnect;

-- ─── 1. Users ────────────────────────────────────────────────────────────────
--  Stores registered users. Passwords are stored as bcrypt hashes.
CREATE TABLE IF NOT EXISTS users (
  id         INT          NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(180) NOT NULL,
  password   VARCHAR(255) NOT NULL,   -- bcrypt hash
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 2. Trains ───────────────────────────────────────────────────────────────
--  Master list of trains. Seeded once by the application on first run.
CREATE TABLE IF NOT EXISTS trains (
  id          VARCHAR(20)  NOT NULL,   -- e.g. 'TRN001'
  name        VARCHAR(120) NOT NULL,
  source      VARCHAR(100) NOT NULL,
  destination VARCHAR(100) NOT NULL,
  departure   VARCHAR(10)  NOT NULL,   -- 'HH:MM'
  arrival     VARCHAR(10)  NOT NULL,   -- 'HH:MM'
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 3. Seats ────────────────────────────────────────────────────────────────
--  One row per physical seat per train.
--  status: 'available' | 'locked' | 'booked'
--  locked_by_user_id: set while a user holds the seat in their queue slot.
CREATE TABLE IF NOT EXISTS seats (
  id               INT          NOT NULL AUTO_INCREMENT,
  train_id         VARCHAR(20)  NOT NULL,
  seat_number      INT          NOT NULL,
  coach            VARCHAR(30)  NOT NULL DEFAULT 'General',
  seat_type        ENUM('UB','MB','LB','Window','Aisle','Middle') NOT NULL DEFAULT 'LB',
  status           ENUM('available','locked','booked') NOT NULL DEFAULT 'available',
  locked_by_user_id INT         NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seat_per_train (train_id, seat_number),
  CONSTRAINT fk_seats_train   FOREIGN KEY (train_id) REFERENCES trains (id)  ON DELETE CASCADE,
  CONSTRAINT fk_seats_locker  FOREIGN KEY (locked_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 4. Queue ────────────────────────────────────────────────────────────────
--  Tracks users waiting for seat confirmation.
--  selected_seats stores comma-separated seat numbers (e.g. '1,5,12').
CREATE TABLE IF NOT EXISTS queue (
  id             INT      NOT NULL AUTO_INCREMENT,
  user_id        INT      NOT NULL,
  train_id       VARCHAR(20) NOT NULL,
  position       INT      NOT NULL,
  selected_seats TEXT     NOT NULL,   -- comma-separated seat numbers
  joined_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_queue_user  FOREIGN KEY (user_id)  REFERENCES users  (id) ON DELETE CASCADE,
  CONSTRAINT fk_queue_train FOREIGN KEY (train_id) REFERENCES trains (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 5. Bookings ─────────────────────────────────────────────────────────────
--  Confirmed seat reservations.
--  booking_status: 'confirmed' | 'cancelled'
--  seat_numbers   stores comma-separated seat numbers (e.g. '1,5,12').
CREATE TABLE IF NOT EXISTS bookings (
  id             INT          NOT NULL AUTO_INCREMENT,
  user_id        INT          NOT NULL,
  train_id       VARCHAR(20)  NOT NULL,
  seat_numbers   TEXT         NOT NULL,   -- comma-separated seat numbers
  booking_status ENUM('confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_bookings_user  FOREIGN KEY (user_id)  REFERENCES users  (id) ON DELETE CASCADE,
  CONSTRAINT fk_bookings_train FOREIGN KEY (train_id) REFERENCES trains (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
