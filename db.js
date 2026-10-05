require('dotenv').config();
const { Pool } = require('pg');

// La cadena de conexión SIEMPRE viene de la variable de entorno (.env local o Render).
// Nunca escribas la contraseña directamente en el código.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Falta la variable de entorno DATABASE_URL. Configúrala en tu archivo .env o en Render.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;