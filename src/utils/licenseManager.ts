// src/utils/licenseManager.ts

export const SECRET_SALT = "_TORNEOS_LIFETIME_MP_2026";

/**
 * Valida si un código de licencia ingresado es correcto para un Club ID dado.
 * Utiliza crypto.subtle (disponible en navegadores modernos).
 */
export async function validarLicenciaTorneo(clubId: string, codigoIngresado: string): Promise<boolean> {
  if (!clubId || !codigoIngresado) return false;
  
  try {
    const payload = clubId.toUpperCase().trim() + SECRET_SALT;
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    
    // Hash SHA-256 nativo del navegador
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    
    const hash8 = hashHex.substring(0, 8);
    const expectedCode = `TRN-${hash8.substring(0, 4)}-${hash8.substring(4, 8)}`;
    
    return codigoIngresado.trim().toUpperCase() === expectedCode;
  } catch (error) {
    console.error("Error al validar licencia:", error);
    return false;
  }
}
