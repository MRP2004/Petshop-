import 'dotenv/config';
import app from './app.js';
import sequelize from './config/database.js';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await sequelize.authenticate();

    console.log('Conexión con MySQL establecida correctamente');

    app.listen(PORT, () => {
      console.log(`API Petshop ejecutándose en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo conectar con MySQL:', error.message);
    process.exit(1);
  }
};

startServer();