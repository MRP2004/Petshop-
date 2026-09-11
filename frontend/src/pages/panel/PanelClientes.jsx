import GestionEntidad from '../../components/GestionEntidad.jsx';
import clientesApi from '../../api/clientes.api.js';

const campos = [
  { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
  { nombre: 'apellido', etiqueta: 'Apellido', tipo: 'texto', requerido: true },
  { nombre: 'email', etiqueta: 'Correo electrónico', tipo: 'texto' },
  { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'texto' },
  { nombre: 'direccion', etiqueta: 'Dirección', tipo: 'texto' },
];

const columnas = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'apellido', etiqueta: 'Apellido' },
  { clave: 'email', etiqueta: 'Correo electrónico' },
  { clave: 'telefono', etiqueta: 'Teléfono' },
];

// No incluye alta pública: un Cliente con cuenta propia se crea vía
// /registro (crea Cliente + Usuario juntos). Esta pantalla es para que
// personal administre clientes existentes o cargue uno sin cuenta propia
// (p. ej. para una venta telefónica).
const PanelClientes = () => (
  <GestionEntidad
    titulo="Clientes"
    servicio={clientesApi}
    campos={campos}
    columnas={columnas}
    idCampo="idCliente"
  />
);

export default PanelClientes;
