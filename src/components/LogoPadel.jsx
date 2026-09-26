export default function LogoPadel({ className = "w-8 h-8" }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Pelota de pádel */}
      <circle cx="7" cy="24" r="4.2" fill="currentColor" />
      <path
        d="M4.5 22.3C6 23.8 8 23.8 9.5 22.3M4.5 25.7C6 27.2 8 27.2 9.5 25.7"
        stroke="white"
        strokeWidth="0.8"
        strokeLinecap="round"
      />

      {/* Paleta de pádel (Perfil sólido y cuello clásico) */}
      <path
        d="M17.5 4C13.36 4 10 7.36 10 11.5C10 14.3 11.55 16.74 13.85 18.01L14.5 20.5C14.6 20.8 14.9 21 15.2 21H17L18.4 28.2C18.5 28.7 18.9 29 19.4 29H20.6C21.1 29 21.5 28.7 21.6 28.2L23 21H24.8C25.1 21 25.4 20.8 25.5 20.5L26.15 18.01C28.45 16.74 30 14.3 30 11.5C30 7.36 26.64 4 22.5 4H17.5Z"
        fill="currentColor"
      />

      {/* Detalles del grip */}
      <path
        d="M18.8 23H21.2M19.1 25H20.9M19.3 27H20.7"
        stroke="white"
        strokeWidth="0.8"
        strokeLinecap="round"
      />

      {/* Agujeros característicos de la paleta (perforaciones de pádel) */}
      <circle cx="16.5" cy="9.5" r="0.9" fill="white" />
      <circle cx="20" cy="9.5" r="0.9" fill="white" />
      <circle cx="23.5" cy="9.5" r="0.9" fill="white" />
      <circle cx="14.8" cy="12.5" r="0.9" fill="white" />
      <circle cx="18.2" cy="12.5" r="0.9" fill="white" />
      <circle cx="21.8" cy="12.5" r="0.9" fill="white" />
      <circle cx="25.2" cy="12.5" r="0.9" fill="white" />
      <circle cx="16.5" cy="15.5" r="0.9" fill="white" />
      <circle cx="20" cy="15.5" r="0.9" fill="white" />
      <circle cx="23.5" cy="15.5" r="0.9" fill="white" />
    </svg>
  );
}
