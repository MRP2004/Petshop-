import GestionEntidad from '../../components/GestionEntidad.jsx';
import medioPagoApi from '../../api/medioPago.api.js';

const campos = [
  { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
  { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto' },
  { nombre: 'habilitado', etiqueta: 'Habilitado', tipo: 'booleano' },
];

const columnas = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'descripcion', etiqueta: 'Descripción' },
  { clave: 'habilitado', etiqueta: 'Habilitado', formatear: (fila) => (fila.habilitado ? 'Sí' : 'No') },
];

const PanelMediosPago = () => (
  <GestionEntidad
    titulo="Medios de pago"
    servicio={medioPagoApi}
    campos={campos}
    columnas={columnas}
    idCampo="idMedioPago"
  />
);

export default PanelMediosPago;
