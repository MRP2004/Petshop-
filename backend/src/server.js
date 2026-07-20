import 'dotenv/config';
import app from './app.js';
import sequelize from './config/database.js';
import './models/tipoMascota.model.js';
import './models/categoria.model.js';
import './models/proveedor.model.js';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    console.log('Conexión con MySQL establecida correctamente');
    console.log('Modelos sincronizados con la base de datos');

    app.listen(PORT, () => {
      console.log(`API Petshop ejecutándose en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
};

startServer();