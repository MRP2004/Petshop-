import GestionEntidad from '../../components/GestionEntidad.jsx';
import proveedoresApi from '../../api/proveedores.api.js';

const campos = [
  { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true },
  { nombre: 'direccion', etiqueta: 'Dirección', tipo: 'texto' },
  { nombre: 'CUIT', etiqueta: 'CUIT', tipo: 'texto' },
  { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'texto' },
  { nombre: 'mail', etiqueta: 'Correo electrónico', tipo: 'texto' },
];

const columnas = [
  { clave: 'descripcion', etiqueta: 'Descripción' },
  { clave: 'CUIT', etiqueta: 'CUIT' },
  { clave: 'telefono', etiqueta: 'Teléfono' },
  { clave: 'mail', etiqueta: 'Correo electrónico' },
];

const PanelProveedores = () => (
  <GestionEntidad
    titulo="Proveedores"
    servicio={proveedoresApi}
    campos={campos}
    columnas={columnas}
    idCampo="idProveedor"
  />
);

export default PanelProveedores;
