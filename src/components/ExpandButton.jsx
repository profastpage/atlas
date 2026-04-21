'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ExpandButton — Boton minimalista para activar el Modo Expandido.
 * Se renderiza debajo de mensajes cortos del asistente.
 * - Estado reposo: "Ver analisis expandido"
 * - Estado cargando: spinner + "Expandiendo..."
 * - Tras recibir la respuesta, desaparece (el padre lo controla)
 */
export default function ExpandButton({ onExpand, isExpanding }) {
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    if (clicked || isExpanding) return;
    setClicked(true);
    onExpand();
  };

  return (
    <AnimatePresence>
      {!clicked && !isExpanding && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="flex justify-end mt-1 mr-1"
        >
          <button
            onClick={handleClick}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all active:scale-95 cursor-pointer select-none"
          >
            <span className="text-[10px]">
              {'\u2192'}
            </span>
            Ver analisis expandido
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * ExpandSpinner — Se muestra mientras se genera la respuesta expandida.
 * Reemplaza al ExpandButton durante la carga.
 */
export function ExpandSpinner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex justify-end mt-1 mr-1"
    >
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium text-emerald-400/70 select-none">
        <svg
          className="animate-spin h-3 w-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        Expandiendo analisis...
      </div>
    </motion.div>
  );
}
