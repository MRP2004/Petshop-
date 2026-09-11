import { useEffect, useState } from 'react';

// Hook para el patrón repetido en casi toda página que depende de la API:
// pedir datos, mostrar "cargando", mostrar el error si falla, y poder
// reintentar. Se centraliza acá en vez de repetir el mismo
// useState/useEffect en cada página.
//
// `solicitar` debe ser una función estable entre renders (armada con
// useCallback en el componente que llama, con sus propias dependencias
// explícitas: ver Home.jsx, Catalogo.jsx, etc.) para que el efecto de abajo
// solo se dispare cuando esas dependencias cambian de verdad.
//
// Sobre react-hooks/set-state-in-effect en las dos líneas de abajo: hace
// falta resetear cargando/error de forma sincrónica cuando cambian las
// dependencias (si no, se vería el resultado anterior mientras se pide el
// nuevo). Es el mismo costo (una vuelta de render extra) que pagaría
// cualquier librería de data-fetching (react-query, SWR); se decidió no
// agregar esa dependencia nueva y aceptar el mismo patrón "a mano", en este
// único lugar centralizado en vez de repetido en cada página.
const useCargaDatos = (solicitar, dependencias = []) => {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;

    setCargando(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);

    solicitar()
      .then((resultado) => {
        if (vigente) setDatos(resultado);
      })
      .catch((err) => {
        if (vigente) setError(err.message);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  // No memoizada a propósito (react-hooks/use-memo exige un arreglo de
  // dependencias literal, y acá "dependencias" es dinámico, provisto por
  // quien use el hook): solo se usa como manejador de clic ("Reintentar"),
  // no como dependencia de otro efecto, así que no hace falta useCallback.
  const recargar = () => {
    setCargando(true);
    setError(null);
    solicitar()
      .then(setDatos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  };

  return { datos, setDatos, cargando, error, recargar };
};

export default useCargaDatos;
