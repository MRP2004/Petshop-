import { useCallback, useState } from 'react';
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/EstadosSolicitud.jsx';
import useCargaDatos from '../../hooks/useCargaDatos.js';
import tiendaApi from '../../api/tienda.api.js';

// Administración de tiendas (ronda 2, Etapa 8): exclusivo administrador.
// Suspender/reactivar hace que `tienda.estado` sea un campo REAL — el
// backend lo hace cumplir en cada escritura de producto de esa tienda (ver
// producto.service.js), no es decorativo.
const PanelTiendas = () => {
  const { datos: tiendas, cargando, error, recargar } = useCargaDatos(useCallback(() => tiendaApi.listarTodas(), []));
  const [enCurso, setEnCurso] = useState(null); // idTienda en vuelo
  const [errorAccion, setErrorAccion] = useState(null);

  const alternarEstado = async (tienda) => {
    setEnCurso(tienda.idTienda);
    setErrorAccion(null);
    try {
      await tiendaApi.cambiarEstado(tienda.idTienda, tienda.estado === 'activa' ? 'suspendida' : 'activa');
      recargar();
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setEnCurso(null);
    }
  };

  if (cargando) return <EstadoCarga />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;

  return (
    <div>
      <h2>Tiendas</h2>
      {errorAccion && <EstadoError mensaje={errorAccion} />}

      {tiendas?.length === 0 && <EstadoVacio mensaje="Todavía no hay ninguna tienda." />}

      {tiendas?.length > 0 && (
        <div className="gestion-entidad__tabla-scroll">
          <table className="gestion-entidad__tabla">
            <thead>
              <tr>
                <th>Tienda</th>
                <th>Dueño</th>
                <th>Documento</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {tiendas.map((tienda) => (
                <tr key={tienda.idTienda}>
                  <td>{tienda.nombre}</td>
                  <td>{tienda.usuario?.cliente?.nombre} {tienda.usuario?.cliente?.apellido} ({tienda.usuario?.email})</td>
                  <td>{tienda.tipoDocumento} {tienda.numeroDocumento}</td>
                  <td>{tienda.estado}</td>
                  <td className="gestion-entidad__acciones">
                    <button
                      type="button"
                      className="boton-enlace"
                      disabled={enCurso === tienda.idTienda}
                      onClick={() => alternarEstado(tienda)}
                    >
                      {enCurso === tienda.idTienda
                        ? 'Actualizando…'
                        : tienda.estado === 'activa'
                          ? 'Suspender'
                          : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PanelTiendas;
