import React from 'react';

function ProductCard({ producto }) {
  return (
    <div style={{
      backgroundColor: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: '10px',
      padding: '20px',
      width: '220px',
      textAlign: 'center',
      boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
    }}>
      {/* Icono/Imagen temporal */}
      <div style={{ fontSize: '4rem', marginBottom: '15px', backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
        {producto.tag}
      </div>
      
      {/* Información */}
      <h3 style={{ fontSize: '1.1rem', margin: '10px 0', height: '45px', overflow: 'hidden' }}>
        {producto.name}
      </h3>
      <p style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#2b2b2b', margin: '10px 0' }}>
        ${producto.price.toLocaleString('es-AR')}
      </p>

      {/* Botón de acción */}
      <button style={{
        backgroundColor: '#228be6',
        color: '#fff',
        border: 'none',
        width: '100%',
        padding: '10px 0',
        borderRadius: '5px',
        fontWeight: 'bold',
        cursor: 'pointer'
      }}>
        Añadir 🛒
      </button>
    </div>
  );
}

export default ProductCard;