CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(140) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('student','driver','admin')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended','rejected')),
  phone VARCHAR(30),
  avatar_url TEXT,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registration_number VARCHAR(40) NOT NULL UNIQUE,
  make VARCHAR(80),
  colour VARCHAR(50),
  capacity SMALLINT NOT NULL DEFAULT 3 CHECK (capacity BETWEEN 1 AND 6),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  zone VARCHAR(40) DEFAULT 'central',
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS fare_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_fare NUMERIC(10,2) NOT NULL CHECK(base_fare >= 0),
  per_zone_fare NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(per_zone_fare >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(24) NOT NULL UNIQUE,
  student_id UUID NOT NULL REFERENCES users(id),
  driver_id UUID REFERENCES users(id),
  pickup_id UUID NOT NULL REFERENCES locations(id),
  destination_id UUID NOT NULL REFERENCES locations(id),
  note TEXT,
  preferred_driver_id UUID REFERENCES users(id),
  scheduled_at TIMESTAMPTZ,
  estimated_fare NUMERIC(10,2) NOT NULL CHECK(estimated_fare >= 0),
  final_fare NUMERIC(10,2),
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','driver_arriving','in_progress','completed','cancelled','rejected','expired')),
  rating SMALLINT CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  rating_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(pickup_id <> destination_id)
);

CREATE INDEX IF NOT EXISTS bookings_student_created_idx ON bookings(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_driver_status_idx ON bookings(driver_id, status);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);

CREATE TABLE IF NOT EXISTS payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK(amount >= 0),
  method VARCHAR(20) NOT NULL DEFAULT 'cash',
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
    CHECK(status IN ('unpaid','reported','confirmed','disputed')),
  reported_by UUID REFERENCES users(id),
  confirmed_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60),
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

INSERT INTO locations(name, zone) VALUES
  ('Main Gate', 'entrance'),
  ('University Library', 'academic'),
  ('Administration Block', 'admin'),
  ('Student Hostel', 'residential'),
  ('Lecture Theatre', 'academic'),
  ('ICT Centre', 'academic'),
  ('Cafeteria', 'social'),
  ('Science Laboratory', 'academic'),
  ('Sports Complex', 'recreation'),
  ('Medical Centre', 'services')
ON CONFLICT(name) DO NOTHING;

INSERT INTO fare_settings(base_fare, per_zone_fare)
SELECT 300, 50
WHERE NOT EXISTS (SELECT 1 FROM fare_settings WHERE active = TRUE);
