require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs');
const dns = require('dns');
const session = require('express-session');

dns.setDefaultResultOrder('ipv4first');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- SESIONES DE LOGIN ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'cambia-esta-clave-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
    sameSite: 'lax'
  }
}));

// Middleware: exige haber iniciado sesión
function requireLogin(req, res, next) {
  if (req.session && req.session.autenticado) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Sesión no iniciada' });
  }
  return res.redirect('/login.html');
}

// --- RUTAS DE LOGIN (públicas, sin protección) ---
app.post('/api/login', (req, res) => {
  const { dni, password } = req.body;
  const dniValido = process.env.ADMIN_DNI;
  const passValido = process.env.ADMIN_PASSWORD;

  if (!dniValido || !passValido) {
    return res.status(500).json({ error: 'El servidor no tiene configuradas las credenciales de acceso.' });
  }

  if (dni === dniValido && password === passValido) {
    req.session.autenticado = true;
    return res.json({ ok: true });
  }

  return res.status(401).json({ error: 'DNI o contraseña incorrectos' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// --- RUTAS PROTEGIDAS ---

app.get('/', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

app.get('/app.html', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// Protege TODAS las rutas /api/* excepto /api/login (ya definida arriba)
app.use('/api', requireLogin);

// Archivos estáticos (login.html, Logo.png, July.ico, etc.)
// index:false evita que Express sirva app.html automáticamente en "/"
app.use(express.static(__dirname, { index: false }));

// Configuración de conexión a PostgreSQL (Neon)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Falta la variable de entorno DATABASE_URL. Configúrala en Render o en tu archivo .env local.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function iniciarBaseDeDatos() {
  try {
    await pool.query('SELECT 1');
    console.log('☁️ Conectado a la base de datos en la nube (Neon).');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        precio_menudeo NUMERIC(10, 2) NOT NULL,
        precio_ciento NUMERIC(10, 2),
        precio_millar NUMERIC(10, 2),
        stock INT NOT NULL CHECK (stock >= 0)
      );
    `);

    await pool.query(`
      ALTER TABLE productos
        ADD COLUMN IF NOT EXISTS precio_menudeo NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS precio_media_docena NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS precio_docena NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS precio_cuarto NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS precio_ciento NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS precio_millar NUMERIC(10, 2);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY,
        producto_nombre VARCHAR(100) NOT NULL,
        cantidad INT NOT NULL,
        precio_unitario NUMERIC(10, 2) NOT NULL,
        total NUMERIC(10, 2) NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Conexión exitosa a PostgreSQL ("neondb").');
    console.log('✅ Tablas de inventario y ventas listas.');
  } catch (err) {
    console.error('❌ Error crítico al inicializar PostgreSQL:', err.message);
    process.exit(1);
  }
}

// --- API PRODUCTOS ---

app.get('/api/productos', async (req, res) => {
  try {
    const resu = await pool.query('SELECT * FROM productos ORDER BY id ASC');
    res.json(resu.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/productos', async (req, res) => {
  try {
    const {
      nombre, precio_menudeo, precio_media_docena, precio_docena,
      precio_cuarto, precio_ciento, precio_millar, stock
    } = req.body;

    const pMenudeo = parseFloat(precio_menudeo);
    const pMediaDocena = precio_media_docena ? parseFloat(precio_media_docena) : null;
    const pDocena = precio_docena ? parseFloat(precio_docena) : null;
    const pCuarto = precio_cuarto ? parseFloat(precio_cuarto) : null;
    const pCiento = precio_ciento ? parseFloat(precio_ciento) : pMenudeo;
    const pMillar = precio_millar ? parseFloat(precio_millar) : pCiento;
    const cantStock = parseInt(stock, 10);

    const resu = await pool.query(
      `INSERT INTO productos
       (nombre, precio_menudeo, precio_media_docena, precio_docena, precio_cuarto, precio_ciento, precio_millar, stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [nombre, pMenudeo, pMediaDocena, pDocena, pCuarto, pCiento, pMillar, cantStock]
    );
    res.status(201).json(resu.rows[0]);
  } catch (err) {
    console.error('Error POST /api/productos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre, precio_menudeo, precio_media_docena, precio_docena,
      precio_cuarto, precio_ciento, precio_millar, stock
    } = req.body;

    const pMenudeo = parseFloat(precio_menudeo);
    const pMediaDocena = precio_media_docena ? parseFloat(precio_media_docena) : null;
    const pDocena = precio_docena ? parseFloat(precio_docena) : null;
    const pCuarto = precio_cuarto ? parseFloat(precio_cuarto) : null;
    const pCiento = precio_ciento ? parseFloat(precio_ciento) : pMenudeo;
    const pMillar = precio_millar ? parseFloat(precio_millar) : pCiento;

    const resu = await pool.query(
      `UPDATE productos
       SET nombre = $1, precio_menudeo = $2, precio_media_docena = $3, precio_docena = $4,
           precio_cuarto = $5, precio_ciento = $6, precio_millar = $7, stock = $8
       WHERE id = $9 RETURNING *`,
      [nombre, pMenudeo, pMediaDocena, pDocena, pCuarto, pCiento, pMillar, parseInt(stock, 10), id]
    );

    if (resu.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ mensaje: 'Producto actualizado con éxito', producto: resu.rows[0] });
  } catch (err) {
    console.error('Error PUT /api/productos/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resu = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING *', [id]);

    if (resu.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ mensaje: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API VENTAS ---

function obtenerPrecioSegunCantidad(producto, cantidad) {
  let precio = parseFloat(producto.precio_menudeo);

  if (cantidad >= 1000 && producto.precio_millar) {
    precio = parseFloat(producto.precio_millar);
  } else if (cantidad >= 100 && producto.precio_ciento) {
    precio = parseFloat(producto.precio_ciento);
  } else if (cantidad >= 25 && producto.precio_cuarto) {
    precio = parseFloat(producto.precio_cuarto);
  } else if (cantidad >= 12 && producto.precio_docena) {
    precio = parseFloat(producto.precio_docena);
  } else if (cantidad >= 6 && producto.precio_media_docena) {
    precio = parseFloat(producto.precio_media_docena);
  }

  return precio;
}

app.post('/api/ventas', async (req, res) => {
  const client = await pool.connect();
  try {
    const { producto_id, cantidad } = req.body;
    const cant = parseInt(cantidad, 10);

    if (isNaN(cant) || cant <= 0) {
      return res.status(400).json({ error: 'La cantidad debe ser un número entero mayor a 0' });
    }

    await client.query('BEGIN');

    const prodRes = await client.query('SELECT * FROM productos WHERE id = $1 FOR UPDATE', [producto_id]);
    if (prodRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const producto = prodRes.rows[0];
    if (producto.stock < cant) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Stock insuficiente. Stock disponible: ${producto.stock}` });
    }

    const precioUnitario = obtenerPrecioSegunCantidad(producto, cant);
    const total = precioUnitario * cant;
    const nuevoStock = producto.stock - cant;

    await client.query('UPDATE productos SET stock = $1 WHERE id = $2', [nuevoStock, producto_id]);

    const ventaRes = await client.query(
      `INSERT INTO ventas (producto_nombre, cantidad, precio_unitario, total)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [producto.nombre, cant, precioUnitario, total]
    );

    await client.query('COMMIT');
    res.status(201).json(ventaRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/ventas', async (req, res) => {
  try {
    const resu = await pool.query('SELECT * FROM ventas ORDER BY id DESC');
    res.json(resu.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ventas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resu = await pool.query('DELETE FROM ventas WHERE id = $1 RETURNING *', [id]);
    if (resu.rows.length === 0) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    res.json({ mensaje: 'Venta eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ventas', async (req, res) => {
  try {
    await pool.query('DELETE FROM ventas');
    res.json({ mensaje: 'Historial de ventas vaciado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API MÉTRICAS Y REPORTES ---

app.get('/api/resumen', async (req, res) => {
  try {
    const ventasRes = await pool.query('SELECT COALESCE(SUM(total), 0) AS total_recaudado, COUNT(*) AS total_ventas FROM ventas');
    const stockRes = await pool.query('SELECT COALESCE(SUM(stock), 0) AS stock_total FROM productos');

    res.json({
      totalRecaudado: parseFloat(ventasRes.rows[0].total_recaudado),
      totalVentas: parseInt(ventasRes.rows[0].total_ventas, 10),
      stockTotal: parseInt(stockRes.rows[0].stock_total, 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/top-productos', async (req, res) => {
  try {
    const { periodo } = req.query;
    let filtroFecha = '';

    if (periodo === 'hoy') {
      filtroFecha = "WHERE fecha >= CURRENT_DATE";
    } else if (periodo === 'semana') {
      filtroFecha = "WHERE fecha >= date_trunc('week', CURRENT_DATE)";
    } else if (periodo === 'mes') {
      filtroFecha = "WHERE fecha >= date_trunc('month', CURRENT_DATE)";
    } else if (periodo === 'anio') {
      filtroFecha = "WHERE fecha >= date_trunc('year', CURRENT_DATE)";
    }

    const query = `
      SELECT
        producto_nombre,
        COALESCE(SUM(cantidad), 0)::INT AS unidades_vendidas,
        COALESCE(SUM(total), 0)::NUMERIC(10,2) AS total_facturado,
        COUNT(*)::INT AS numero_ventas
      FROM ventas
      ${filtroFecha}
      GROUP BY producto_nombre
      ORDER BY unidades_vendidas DESC
      LIMIT 10;
    `;

    const resu = await pool.query(query);
    res.json(resu.rows);
  } catch (err) {
    console.error('Error en /api/reportes/top-productos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/exportar-excel', async (req, res) => {
  try {
    const resu = await pool.query('SELECT * FROM ventas ORDER BY id DESC');
    const ventas = resu.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de Ventas');

    worksheet.columns = [
      { header: 'ID Venta', key: 'id', width: 12 },
      { header: 'Producto', key: 'producto_nombre', width: 30 },
      { header: 'Cantidad', key: 'cantidad', width: 12 },
      { header: 'Precio Unitario (S/)', key: 'precio_unitario', width: 20 },
      { header: 'Total (S/)', key: 'total', width: 16 },
      { header: 'Fecha y Hora', key: 'fecha', width: 25 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '007BFF' }
    };

    ventas.forEach(v => {
      worksheet.addRow({
        id: v.id,
        producto_nombre: v.producto_nombre,
        cantidad: v.cantidad,
        precio_unitario: parseFloat(v.precio_unitario),
        total: parseFloat(v.total),
        fecha: new Date(v.fecha).toLocaleString('es-PE')
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Ventas_Tienda.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inicializar BD y luego arrancar servidor HTTP
iniciarBaseDeDatos().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${port}`);
  });
});