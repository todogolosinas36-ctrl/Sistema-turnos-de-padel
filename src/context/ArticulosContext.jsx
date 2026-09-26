import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const ArticulosContext = createContext();

export function ArticulosProvider({ children }) {
  const [articulos, setArticulos] = useState([]);
  const [loading, setLoading] = useState(true);

  const obtenerArticulos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('articulos').select('*').order('nombre');
      if (error) throw error;
      
      const mapeados = (data || []).map((art) => ({
        id: art.id,
        nombre: art.nombre,
        precio: art.precio,
        // La columna `categoria` es opcional: si no existe, se agrupa en "Otros"
        // para que los filtros del POS sigan funcionando.
        categoria: art.categoria || 'Otros',
        codigoBarras: art.codigo_barras,
        stock: art.stock,
      }));
      setArticulos(mapeados);
    } catch (error) {
      console.error('Error al obtener articulos de Supabase:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    obtenerArticulos();
  }, []);

  const crearArticulo = async (nuevoArticulo) => {
    try {
      const articulo = {
        nombre: nuevoArticulo.nombre.trim(),
        precio: Number(nuevoArticulo.precio) || 0,
        categoria: (nuevoArticulo.categoria || 'Otros').trim() || 'Otros',
        codigo_barras: (nuevoArticulo.codigoBarras || '').trim(),
        stock: Number(nuevoArticulo.stock) || 0
      };
      
      const { data, error } = await supabase.from('articulos').insert([articulo]).select();
      if (error) throw error;
      
      if (data && data.length > 0) {
        const artDb = data[0];
        const insertado = {
          id: artDb.id,
          nombre: artDb.nombre,
          precio: artDb.precio,
          categoria: artDb.categoria || 'Otros',
          codigoBarras: artDb.codigo_barras,
          stock: artDb.stock
        };
        setArticulos((prev) => [insertado, ...prev]);
        return insertado;
      }
    } catch (error) {
      console.error('Error al crear articulo:', error);
      throw error;
    }
  };

  const actualizarArticulo = async (id, cambios) => {
    try {
      const payload = {};
      if (cambios.nombre !== undefined) payload.nombre = cambios.nombre.trim();
      if (cambios.precio !== undefined) payload.precio = Number(cambios.precio);
      if (cambios.categoria !== undefined) payload.categoria = (cambios.categoria || 'Otros').trim();
      if (cambios.codigoBarras !== undefined) payload.codigo_barras = cambios.codigoBarras.trim();
      if (cambios.stock !== undefined) payload.stock = Number(cambios.stock);

      const { data, error } = await supabase.from('articulos').update(payload).eq('id', id).select();
      if (error) throw error;

      if (data && data.length > 0) {
        const artDb = data[0];
        const actualizado = {
          id: artDb.id,
          nombre: artDb.nombre,
          precio: artDb.precio,
          categoria: artDb.categoria || 'Otros',
          codigoBarras: artDb.codigo_barras,
          stock: artDb.stock
        };
        setArticulos((prev) =>
          prev.map((art) => (art.id === id ? actualizado : art))
        );
      }
    } catch (error) {
      console.error('Error al actualizar articulo:', error);
      throw error;
    }
  };

  const eliminarArticulo = async (id) => {
    try {
      const { error } = await supabase.from('articulos').delete().eq('id', id);
      if (error) throw error;
      
      setArticulos((prev) => prev.filter((art) => art.id !== id));
    } catch (error) {
      console.error('Error al eliminar articulo:', error);
      throw error;
    }
  };

  /**
   * Ajusta el stock en cualquier dirección (delta positivo suma, negativo resta).
   * El stock sólo se toca al confirmar la venta, nunca al armar el carrito: así
   * abandonar un cobro a medio hacer no descuenta inventario.
   */
  const ajustarStock = async (id, delta) => {
    const art = articulos.find((a) => a.id === id);
    if (!art) return false;

    const nuevoStock = Math.max(0, (Number(art.stock) || 0) + delta);
    if (nuevoStock === (Number(art.stock) || 0)) return false;

    const { error } = await supabase.from('articulos').update({ stock: nuevoStock }).eq('id', id);
    if (error) {
      console.error('Error al ajustar stock:', error);
      return false;
    }

    setArticulos((prev) => prev.map((a) => (a.id === id ? { ...a, stock: nuevoStock } : a)));
    return true;
  };

  return (
    <ArticulosContext.Provider
      value={{
        articulos,
        setArticulos,
        obtenerArticulos,
        crearArticulo,
        actualizarArticulo,
        eliminarArticulo,
        ajustarStock,
        stockDe: (id) => Number(articulos.find((a) => a.id === id)?.stock) || 0,
        loading
      }}
    >
      {children}
    </ArticulosContext.Provider>
  );
}

export function useArticulos() {
  const context = useContext(ArticulosContext);
  if (!context) {
    throw new Error('useArticulos debe ser usado dentro de un ArticulosProvider');
  }
  return context;
}
