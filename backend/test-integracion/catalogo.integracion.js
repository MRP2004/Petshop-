import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sequelize from '../src/config/database.js';
import app from '../src/app.js';
import TipoMascota from '../src/models/tipoMascota.model.js';
import JerarquiaMascota from '../src/models/jerarquiaMascota.model.js';
import FacetaProducto from '../src/models/facetaProducto.model.js';
import { crearProducto } from '../src/services/producto.service.js';
import { cambiarEstadoTienda } from '../src/services/tienda.service.js';
import {
  prepararEsquema, limpiarDatos, crearProductoDePrueba,
  crearVendedorIndependienteDePrueba, crearUsuarioDePrueba,
} from './ayudaIntegracion.js';

before(prepararEsquema);
beforeEach(limpiarDatos);
after(() => sequelize.close());

test('pagina el catálogo público sin descargar todos los artículos', async () => {
  for (let indice = 0; indice < 26; indice += 1) {
    await crearProductoDePrueba({ nombre: `Artículo catálogo ${String(indice).padStart(2, '0')}` });
  }
  const primera = await request(app).get('/api/productos/catalogo?pagina=1').expect(200);
  const segunda = await request(app).get('/api/productos/catalogo?pagina=2').expect(200);
  assert.equal(primera.body.total, 26);
  assert.equal(primera.body.productos.length, 24);
  assert.equal(segunda.body.productos.length, 2);
  assert.equal(primera.body.totalPaginas, 2);
});

test('filtra subtipo y faceta sin mezclar productos de otro animal', async () => {
  const ave = await TipoMascota.create({ nombre: 'Ave' });
  const periquito = await TipoMascota.create({ nombre: 'Periquito' });
  const canario = await TipoMascota.create({ nombre: 'Canario' });
  await JerarquiaMascota.bulkCreate([
    { idTipoPadre: ave.idTipoMascota, idTipoHijo: periquito.idTipoMascota },
    { idTipoPadre: ave.idTipoMascota, idTipoHijo: canario.idTipoMascota },
  ]);
  const primero = await crearProductoDePrueba({ nombre: 'Semillas de periquito', idTipoMascota: periquito.idTipoMascota });
  const segundo = await crearProductoDePrueba({ nombre: 'Pellets de periquito', idTipoMascota: periquito.idTipoMascota });
  await crearProductoDePrueba({ nombre: 'Semillas de canario', idTipoMascota: canario.idTipoMascota });
  await FacetaProducto.bulkCreate([
    { idProducto: primero.idProducto, formato: 'semillas', marca: 'Luma' },
    { idProducto: segundo.idProducto, formato: 'pellets', marca: 'Nube' },
  ]);

  const resultado = await request(app).get(`/api/productos/catalogo?idTipoMascota=${ave.idTipoMascota}&idSubtipoMascota=${periquito.idTipoMascota}&formato=semillas&marca=Luma`).expect(200);
  assert.equal(resultado.body.total, 1);
  assert.equal(resultado.body.productos[0].nombre, 'Semillas de periquito');
  const marcas = await request(app).get('/api/productos/marcas').expect(200);
  assert.deepEqual(marcas.body, ['Luma', 'Nube']);
  await request(app).get(`/api/productos/catalogo?idTipoMascota=${canario.idTipoMascota}&idSubtipoMascota=${periquito.idTipoMascota}`).expect(400);

  const jerarquia = await request(app).get('/api/tipos-mascota/jerarquia').expect(200);
  assert.equal(jerarquia.body.find((tipo) => tipo.nombre === 'Ave').subtipos.length, 2);
});

test('mantiene ocultos los productos de tiendas suspendidas también en el catálogo paginado', async () => {
  const { usuario, tienda } = await crearVendedorIndependienteDePrueba();
  await crearProducto({
    nombre: 'Collar de tienda suspendida', precio: '500.00', stockActual: 3, stockMinimo: 1,
  }, { idUsuario: usuario.idUsuario, rol: 'vendedor_independiente', idCliente: usuario.idCliente, idTienda: tienda.idTienda });
  const admin = await crearUsuarioDePrueba({ rol: 'administrador', idCliente: null });
  await cambiarEstadoTienda(tienda.idTienda, 'suspendida', { idUsuario: admin.idUsuario, rol: 'administrador' });
  const respuesta = await request(app).get('/api/productos/catalogo?buscar=collar').expect(200);
  assert.equal(respuesta.body.total, 0);
});
