import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararFiltrosCatalogo } from '../src/utils/filtrosCatalogo.js';

test('catálogo: defaults acotados y sin filtros', () => {
  const filtros = prepararFiltrosCatalogo();
  assert.equal(filtros.pagina, 1);
  assert.equal(filtros.limite, 24);
  assert.equal(filtros.idTipoMascota, null);
  assert.deepEqual(filtros.facetas, {});
});

test('catálogo: filtros numéricos y facetas válidas', () => {
  const filtros = prepararFiltrosCatalogo({
    pagina: '3', precioMin: '1200.50', precioMax: '2500',
    disponibles: 'si', etapaVida: 'adulto', tamano: 'mediano', marca: 'Luma',
  });
  assert.equal(filtros.precioMin, 120050);
  assert.equal(filtros.precioMax, 250000);
  assert.equal(filtros.disponibles, true);
  assert.deepEqual(filtros.facetas, { marca: 'Luma', etapaVida: 'adulto', tamano: 'mediano' });
});

test('catálogo: rechaza rangos, páginas y opciones inválidas', () => {
  assert.throws(() => prepararFiltrosCatalogo({ precioMin: '200', precioMax: '100' }), { statusCode: 400 });
  assert.throws(() => prepararFiltrosCatalogo({ pagina: '0' }));
  assert.throws(() => prepararFiltrosCatalogo({ pagina: '1 OR 1=1' }));
  assert.throws(() => prepararFiltrosCatalogo({ formato: 'javascript:alert(1)' }));
  assert.throws(() => prepararFiltrosCatalogo({ marca: '<script>' }));
  assert.throws(() => prepararFiltrosCatalogo({ disponibles: 'false' }));
});
