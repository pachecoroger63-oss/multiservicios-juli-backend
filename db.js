const { Pool } = require('pg');

// Cadena de conexión leyendo variable de entorno en producción o fallback
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_iXeyvjPzn43A@ep-proud-queen-b4ssyrda-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  clientConfig: {
    family: 4
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