import './Footer.css';

// Mismo contenido que el boceto de InicioFront (marca, enlaces, contacto),
// pasado de estilos inline a clases para que respete el mismo sistema de
// diseño mobile-first que el resto del sitio.
const Footer = () => (
  <footer className="footer">
    <div className="footer__columnas contenedor">
      <div>
        <h3>🐾 PetShop</h3>
        <p>Cuidamos a tus mejores amigos con la mejor calidad en alimentos y accesorios.</p>
      </div>

      <div>
        <h4>Enlaces</h4>
        <ul>
          <li>Preguntas frecuentes</li>
          <li>Políticas de envío</li>
          <li>Términos y condiciones</li>
        </ul>
      </div>

      <div>
        <h4>Contacto</h4>
        <p>📍 Av. Principal 1234, Rosario</p>
        <p>📞 +54 341 000-0000</p>
        <p>✉️ soporte@petshop.demo</p>
      </div>
    </div>

    <div className="footer__inferior">© 2026 PetShop — Trabajo práctico DSW, UTN FRRo.</div>
  </footer>
);

export default Footer;
