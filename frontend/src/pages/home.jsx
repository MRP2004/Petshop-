import React from 'react';
import Navbar from '../components/Navbar';
import ProductCard from '../components/ProductCard';
import Footer from '../components/Footer';

function Home() {
  // Datos de prueba (hardcodeados) que después reemplazarán con su Backend Agnóstico
  const productosDestacados = [
    { id: 1, name: 'Alimento Premium Perro 15kg', price: 15500, tag: '🐶' },
    { id: 2, name: 'Rascador de Tres Pisos Gatos', price: 8900, tag: '🐱' },
    { id: 3, name: 'Pelota de Goma Irrompible', price: 2300, tag: '🥎' },
    { id: 4, name: 'Piedras Sanitarias 4kg', price: 4200, tag: '🧼' },
  ];

  return (
    <div className="home-layout" style={{ fontFamily: 'sans-serif', color: '#333' }}>
      {/* Barra de navegación superior */}
      <Navbar />

      {/* Banner de Promociones (Hero) */}
      <section style={{ 
        backgroundColor: '#e3faf2', 
        padding: '60px 20px', 
        textAlign: 'center',
        borderBottom: '1px solid #c2f0e1'
      }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', color: '#0ca678' }}>
          ¡Todo lo que tu mejor amigo necesita con 15% OFF!
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#555', marginBottom: '20px' }}>
          Envíos gratis en compras mayores a $20.000
        </p>
        <button style={{ 
          backgroundColor: '#0ca678', 
          color: '#fff', 
          border: 'none', 
          padding: '12px 24px', 
          fontSize: '1rem', 
          borderRadius: '5px',
          cursor: 'pointer'
        }}>
          Ver Promociones
        </button>
      </section>

      {/* Sección de Categorías Rápidas */}
      <section style={{ padding: '40px 20px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '25px', fontSize: '1.8rem' }}>Comprar por Categoría</h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {['🐶 Perros', '🐱 Gatos', '🐦 Aves', '🐠 Peces'].map((cat, index) => (
            <button key={index} style={{
              padding: '15px 30px',
              fontSize: '1.1rem',
              border: '2px solid #e0e0e0',
              borderRadius: '30px',
              backgroundColor: '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Sección de Productos Destacados */}
      <section style={{ padding: '40px 20px', backgroundColor: '#f9f9f9' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '30px', fontSize: '1.8rem' }}>
          Productos Destacados
        </h2>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '25px', 
          flexWrap: 'wrap',
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          {productosDestacados.map(prod => (
            <ProductCard key={prod.id} producto={prod} />
          ))}
        </div>
      </section>

      {/* Pie de Página */}
      <Footer />
    </div>
  );
}

export default Home;