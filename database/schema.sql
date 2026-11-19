-- ============================================================
-- Academia de Baile - Esquema MySQL 8+
-- ============================================================
CREATE DATABASE IF NOT EXISTS academia_baile
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE academia_baile;

-- ---------- USUARIOS (login del sistema) ----------
CREATE TABLE usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol           ENUM('admin','personal') NOT NULL DEFAULT 'personal',
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- PROFESORES ----------
CREATE TABLE profesores (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(80) NOT NULL,
  apellido   VARCHAR(80) NOT NULL,
  telefono   VARCHAR(30),
  email      VARCHAR(150),
  activo     TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- ALUMNOS ----------
CREATE TABLE alumnos (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(80) NOT NULL,
  apellido          VARCHAR(80) NOT NULL,
  dni               VARCHAR(20) NOT NULL UNIQUE,
  telefono          VARCHAR(30),
  email             VARCHAR(150),
  fecha_inscripcion DATE NOT NULL DEFAULT (CURRENT_DATE),
  estado            ENUM('activo','pendiente_pago','inactivo') NOT NULL DEFAULT 'activo',
  fecha_baja        DATE NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_alumnos_apellido (apellido, nombre),
  INDEX idx_alumnos_estado (estado)
) ENGINE=InnoDB;

-- ---------- CLASES ----------
CREATE TABLE clases (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  profesor_id INT UNSIGNED NOT NULL,
  precio      DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
  cupo_maximo INT UNSIGNED NOT NULL CHECK (cupo_maximo > 0),
  activa      TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_clases_profesor FOREIGN KEY (profesor_id)
    REFERENCES profesores(id) ON DELETE RESTRICT,
  INDEX idx_clases_profesor (profesor_id)
) ENGINE=InnoDB;

-- ---------- HORARIOS DE CLASES ----------
CREATE TABLE clase_horarios (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clase_id    INT UNSIGNED NOT NULL,
  dia_semana  TINYINT UNSIGNED NOT NULL CHECK (dia_semana BETWEEN 1 AND 7), -- 1=Lunes
  hora_inicio TIME NOT NULL,
  hora_fin    TIME NOT NULL,
  CONSTRAINT fk_horarios_clase FOREIGN KEY (clase_id)
    REFERENCES clases(id) ON DELETE CASCADE,
  CONSTRAINT chk_horas CHECK (hora_fin > hora_inicio),
  INDEX idx_horarios_dia (dia_semana, hora_inicio)
) ENGINE=InnoDB;

-- ---------- INSCRIPCIONES ----------
CREATE TABLE inscripciones (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  alumno_id         INT UNSIGNED NOT NULL,
  clase_id          INT UNSIGNED NOT NULL,
  fecha_inscripcion DATE NOT NULL DEFAULT (CURRENT_DATE),
  estado            ENUM('activa','baja') NOT NULL DEFAULT 'activa',
  fecha_baja        DATE NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_insc_alumno FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_insc_clase  FOREIGN KEY (clase_id)  REFERENCES clases(id)  ON DELETE RESTRICT,
  UNIQUE KEY uq_alumno_clase (alumno_id, clase_id),
  INDEX idx_insc_clase_estado (clase_id, estado)
) ENGINE=InnoDB;

-- ---------- PAGOS ----------
-- Una fila por cuota (inscripción + mes). Se crea 'pendiente' y pasa a 'pagado' al cobrar.
CREATE TABLE pagos (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inscripcion_id    INT UNSIGNED NOT NULL,
  periodo           DATE NOT NULL,                 -- primer día del mes que se paga
  importe           DECIMAL(10,2) NOT NULL CHECK (importe >= 0),
  fecha_vencimiento DATE NOT NULL,
  fecha_pago        DATE NULL,
  metodo_pago       ENUM('efectivo','transferencia','tarjeta','mercadopago','otro') NULL,
  estado            ENUM('pendiente','pagado','anulado') NOT NULL DEFAULT 'pendiente',
  registrado_por    INT UNSIGNED NULL,
  observaciones     VARCHAR(255) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pagos_insc FOREIGN KEY (inscripcion_id) REFERENCES inscripciones(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pagos_user FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  UNIQUE KEY uq_insc_periodo (inscripcion_id, periodo),
  INDEX idx_pagos_estado_venc (estado, fecha_vencimiento),
  INDEX idx_pagos_fecha (fecha_pago)
) ENGINE=InnoDB;

-- ---------- ASISTENCIAS ----------
CREATE TABLE asistencias (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inscripcion_id INT UNSIGNED NOT NULL,
  fecha          DATE NOT NULL,
  presente       TINYINT(1) NOT NULL DEFAULT 1,
  registrado_por INT UNSIGNED NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_asis_insc FOREIGN KEY (inscripcion_id) REFERENCES inscripciones(id) ON DELETE RESTRICT,
  CONSTRAINT fk_asis_user FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  UNIQUE KEY uq_asis (inscripcion_id, fecha),
  INDEX idx_asis_fecha (fecha)
) ENGINE=InnoDB;

-- ---------- CONFIGURACION ----------
CREATE TABLE configuracion (
  clave       VARCHAR(50) PRIMARY KEY,
  valor       VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255),
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO configuracion (clave, valor, descripcion) VALUES
 ('dia_vencimiento',   '10', 'Día del mes en que vence la cuota'),
 ('dias_tolerancia',   '15', 'Días tras el vencimiento antes de dar de baja al alumno');

-- ---------- AUDITORIA DE CONSULTAS IA ----------
CREATE TABLE consultas_ia (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NULL,
  pregunta   TEXT NOT NULL,
  respuesta  MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ia_user FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
