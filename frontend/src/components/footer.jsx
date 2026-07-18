import React from 'react';

function Footer() {
  return (
    <footer style={{
      backgroundColor: '#212529',
      color: '#f8f9fa',
      padding: '40px 30px 20px 30px',
      fontFamily: 'sans-serif',
      borderTop: '5px solid #0ca678'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '30px',
        maxWidth: '1200px',
        margin: '0 auto',
        marginBottom: '30px'
      }}>
        {/* Columna 1: Info marca */}
        <div style={{ flex: '1', minWidth: '200px' }}>
          <h3 style={{ color: '#0ca678', marginBottom: '15px' }}>🐾 PetshopHuellitas</h3>
          <p style={{ fontSize: '0.9rem', color: '#adb5bd', lineHeight: '1.5' }}>
            Cuidamos a tus mejores amigos con la mejor calidad en alimentos y accesorios.
          </p>
        </div>

        {/* Columna 2: Enlaces útiles */}
        <div style={{ flex: '1', minWidth: '150px' }}>
          <h4 style={{ marginBottom: '15px', fontSize: '1.1rem' }}>Enlaces</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem', lineHeight: '2' }}>
            <li style={{ cursor: 'pointer', color: '#adb5bd' }}>Preguntas Frecuentes</li>
            <li style={{ cursor: 'pointer', color: '#adb5bd' }}>Políticas de Envío</li>
            <li style={{ cursor: 'pointer', color: '#adb5bd' }}>Términos y Condiciones</li>
          </ul>
        </div>

        {/* Columna 3: Contacto */}
        <div style={{ flex: '1', minWidth: '200px' }}>
          <h4 style={{ marginBottom: '15px', fontSize: '1.1rem' }}>Contacto</h4>
          <p style={{ fontSize: '0.9rem', color: '#adb5bd', margin: '5px 0' }}>📍 Av. Principal 1234, Ciudad</p>
          <p style={{ fontSize: '0.9rem', color: '#adb5bd', margin: '5px 0' }}>📞 +54 11 4444-5555</p>
          <p style={{ fontSize: '0.9rem', color: '#adb5bd', margin: '5px 0' }}>✉️ soporte@petshophuellitas.com</p>
        </div>
      </div>

      {/* Línea divisoria inferior */}
      <div style={{
        borderTop: '1px solid #343a40',
        paddingTop: '20px',
        textAlign: 'center',
        fontSize: '0.85rem',
        color: '#6c757d'
      }}>
        © 2026 PetshopHuellitas. Todos los derechos reservados.
      </div>
    </footer>
  );
}

export default Footer;