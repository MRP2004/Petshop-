import GestionEntidad from '../../components/GestionEntidad.jsx';
import tiposMascotaApi from '../../api/tiposMascota.api.js';

const campos = [
  { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
  { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto' },
];

const columnas = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'descripcion', etiqueta: 'Descripción' },
];

const PanelTiposMascota = () => (
  <GestionEntidad
    titulo="Tipos de mascota"
    servicio={tiposMascotaApi}
    campos={campos}
    columnas={columnas}
    idCampo="idTipoMascota"
  />
);

export default PanelTiposMascota;
