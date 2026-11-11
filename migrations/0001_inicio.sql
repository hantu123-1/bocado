-- Copia en la nube de los datos de la app. Cada registro es un JSON
-- (una comida anotada, un peso, el perfil, etc.).
CREATE TABLE registros (
  tipo TEXT NOT NULL,
  id TEXT NOT NULL,
  datos TEXT NOT NULL,
  mod INTEGER NOT NULL,              -- momento del cambio (ms), lo pone el dispositivo
  borrado INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,              -- orden de llegada: los dispositivos piden "lo nuevo desde seq"
  PRIMARY KEY (tipo, id)
);
CREATE INDEX registros_seq ON registros (seq);
CREATE INDEX registros_fecha ON registros (tipo, json_extract(datos, '$.fecha'));

CREATE TABLE contador (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL);
INSERT INTO contador (id, seq) VALUES (1, 0);

-- Dispositivos que reciben recordatorios
CREATE TABLE suscripciones (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  creado TEXT NOT NULL
);

-- Recordatorios ya enviados (para no repetirlos)
CREATE TABLE avisos_enviados (clave TEXT PRIMARY KEY, ts INTEGER NOT NULL);

-- Intentos de clave, para frenar abusos
CREATE TABLE limites (clave TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX limites_clave_ts ON limites (clave, ts);
