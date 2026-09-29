import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EstadoError } from '../components/EstadosSolicitud.jsx';
import solicitudVendedorApi from '../api/solicitudVendedor.api.js';
import './SolicitudVendedor.css';

// "Quiero ser vendedor" (ronda 2, Etapa 8 — marketplace): solo alcanzable
// por una cuenta 'cliente' ya existente (ver App.jsx). Persona física con
// CUIL o empresa con CUIT + razón social — el backend valida formato y
// dígito verificador real (algoritmo módulo 11), pero esto NO verifica
// existencia fiscal real ante AFIP: se lo decimos explícitamente, no se
// finge una verificación que no existe.
const SolicitudVendedor = () => {
  const [nombreTienda, setNombreTienda] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('CUIL');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [enviado, setEnviado] = useState(false);

  const manejarEnvio = async (evento) => {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setError(null);

    try {
      await solicitudVendedorApi.crear({
        nombreTienda,
        tipoDocumento,
        numeroDocumento,
        razonSocial: tipoDocumento === 'CUIT' ? razonSocial : undefined,
      });
      setEnviado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <div className="pagina contenedor solicitud-vendedor">
        <h1 className="titulo-pagina">Solicitud enviada</h1>
        <p>
          Tu solicitud para vender en PetShop quedó registrada. Un administrador la va a revisar —
          te avisamos por acá (campana de notificaciones) cuando se resuelva.
        </p>
        <Link to="/mi-cuenta" className="boton boton-primario">Volver a Mi cuenta</Link>
      </div>
    );
  }

  return (
    <div className="pagina contenedor solicitud-vendedor">
      <h1 className="titulo-pagina">Quiero ser vendedor</h1>
      <p className="solicitud-vendedor__ayuda">
        Vendé tus propios productos en PetShop. Necesitás un CUIL (persona física) o un CUIT
        (empresa, con razón social). Solo validamos el formato y el dígito verificador — esto no
        es una verificación fiscal real ante AFIP.
      </p>

      <form className="tarjeta solicitud-vendedor__formulario" onSubmit={manejarEnvio}>
        <div className="campo">
          <label htmlFor="nombreTienda">Nombre de tu tienda</label>
          <input
            id="nombreTienda"
            type="text"
            value={nombreTienda}
            onChange={(e) => setNombreTienda(e.target.value)}
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="tipoDocumento">Tipo de documento</label>
          <select id="tipoDocumento" value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)}>
            <option value="CUIL">CUIL (persona física)</option>
            <option value="CUIT">CUIT (empresa)</option>
          </select>
        </div>

        <div className="campo">
          <label htmlFor="numeroDocumento">{tipoDocumento === 'CUIT' ? 'CUIT' : 'CUIL'}</label>
          <input
            id="numeroDocumento"
            type="text"
            placeholder="20-12345678-9"
            value={numeroDocumento}
            onChange={(e) => setNumeroDocumento(e.target.value)}
            required
          />
        </div>

        {tipoDocumento === 'CUIT' && (
          <div className="campo">
            <label htmlFor="razonSocial">Razón social</label>
            <input
              id="razonSocial"
              type="text"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              required
            />
          </div>
        )}

        {error && <EstadoError mensaje={error} />}

        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  );
};

export default SolicitudVendedor;
