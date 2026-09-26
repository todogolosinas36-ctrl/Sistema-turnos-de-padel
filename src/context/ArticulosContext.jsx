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
      
      const mapeados = (data || []).map(art => ({
        id: art.id,
        nombre: art.nombre,
        precio: art.precio,
        codigoBarras: art.codigo_barras,
        stock: art.stock
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

  const descontarStock = async (id, cantidad = 1) => {
    try {
      const art = articulos.find(a => a.id === id);
      if (!art) return;
      
      const nuevoStock = Math.max(0, (art.stock || 0) - cantidad);
      
      const { error } = await supabase.from('articulos').update({ stock: nuevoStock }).eq('id', id);
      if (error) throw error;
      
      setArticulos((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, stock: nuevoStock } : a
        )
      );
    } catch (error) {
      console.error('Error al descontar stock:', error);
      throw error;
    }
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
        descontarStock,
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
