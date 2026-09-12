// Parser mínimo del encabezado Cookie (evita agregar la dependencia
// cookie-parser solo para esto: Express ya trae `res.cookie()` para
// escribir cookies de salida sin ninguna dependencia extra, lo único que
// faltaba era leer las entrantes).
const analizarCookies = (encabezado) => {
  const cookies = {};

  if (!encabezado || typeof encabezado !== 'string') {
    return cookies;
  }

  for (const parte of encabezado.split(';')) {
    const indice = parte.indexOf('=');
    if (indice === -1) continue;

    const nombre = parte.slice(0, indice).trim();
    const valorCrudo = parte.slice(indice + 1).trim();

    if (!nombre) continue;

    try {
      cookies[nombre] = decodeURIComponent(valorCrudo);
    } catch {
      cookies[nombre] = valorCrudo;
    }
  }

  return cookies;
};

export { analizarCookies };
