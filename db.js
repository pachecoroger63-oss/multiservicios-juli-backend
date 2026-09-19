const { Pool } = require('pg');

// Cadena de conexión de Neon
const connectionString = 'postgresql://neondb_owner:npg_iXeyvjPzn43A@ep-proud-queen-b4ssyrda.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // Requerido para la conexión SSL de Neon
  }
});

// Prueba rápida de conexión
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error al conectar a Neon:', err.message);
  } else {
    console.log('✅ Conectado exitosamente a la base de datos Neon:', res.rows[0].now);
  }
});

module.exports = pool;