import React from 'react';

function Navbar() {
  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '15px 30px',
      backgroundColor: '#fff',
      borderBottom: '1px solid #e0e0e0'
    }}>
      {/* Marca / Logo */}
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0ca678', cursor: 'pointer' }}>
        🐾 Petshop
      </div>

      {/* Buscador */}
      <div style={{ width: '40%' }}>
        <input 
          type="text" 
          placeholder="Buscar alimentos, juguetes, accesorios..." 
          style={{
            width: '100%',
            padding: '10px 15px',
            border: '1px solid #ccc',
            borderRadius: '20px',
            outline: 'none'
          }}
        />
      </div>

      {/* Accesos rápidos */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', fontWeight: '500' }}>
        <span style={{ cursor: 'pointer' }}>👤 Mi Perfil</span>
        <span style={{ cursor: 'pointer', position: 'relative' }}>
          🛒 Carrito 
          <span style={{
            position: 'absolute',
            top: '-8px',
            right: '-12px',
            backgroundColor: '#fa5252',
            color: '#fff',
            fontSize: '0.75rem',
            padding: '2px 6px',
            borderRadius: '50%'
          }}>0</span>
        </span>
      </div>
    </nav>
  );
}

export default Navbar;