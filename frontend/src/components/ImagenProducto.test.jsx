import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImagenProducto from './ImagenProducto.jsx';

const productoConImagen = {
  idProducto: 1,
  nombre: 'Alimento perro adulto',
  categoria: { nombre: 'Alimento' },
  imagen: { idProducto: 1, url: 'https://ejemplo.com/foto.jpg' },
};

const productoSinImagen = {
  idProducto: 2,
  nombre: 'Pelota de goma',
  categoria: { nombre: 'Juguetes' },
};

describe('ImagenProducto', () => {
  it('muestra la imagen real cuando el producto tiene una URL cargada', () => {
    render(<ImagenProducto producto={productoConImagen} claseContenedor="cont" claseImagen="img-real" />);

    const img = screen.getByRole('img', { name: 'Alimento perro adulto' });
    expect(img).toHaveAttribute('src', 'https://ejemplo.com/foto.jpg');
  });

  it('cae al ícono por categoría cuando el producto no tiene imagen cargada', () => {
    render(<ImagenProducto producto={productoSinImagen} claseContenedor="cont" claseImagen="img-real" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('🎾')).toBeInTheDocument();
  });

  // Estado que antes no se contemplaba: una URL cargada por el personal que
  // deja de resolver (servidor externo caído, enlace roto). Sin este
  // manejo, el catálogo mostraría un ícono de imagen rota en vez de caer al
  // ícono por categoría que ya existía como alternativa.
  it('cae al ícono por categoría si la imagen real falla al cargar', () => {
    render(<ImagenProducto producto={productoConImagen} claseContenedor="cont" claseImagen="img-real" />);

    fireEvent.error(screen.getByRole('img'));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('🍖')).toBeInTheDocument();
  });
});
