'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';

interface BuyImagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  yapeNumber?: string;
  onPaymentConfirmed: (quantity: number, amount: number) => void;
}

const IMAGE_PACKAGES = [
  {
    id: '1-foto',
    photos: 1,
    price: 1.0,
    label: '1 foto',
    badge: '',
    style: 'border-gray-600/40 bg-gray-800/30 hover:bg-gray-800/50 text-gray-300',
    highlight: false,
  },
  {
    id: '5-fotos',
    photos: 5,
    price: 4.0,
    label: '5 fotos',
    badge: '',
    style: 'border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-blue-300',
    highlight: false,
  },
  {
    id: '20-fotos',
    photos: 20,
    price: 14.0,
    label: '20 fotos',
    badge: 'Ahorra S/ 6!',
    emoji: '🌟',
    style: 'border-yellow-500/40 bg-gradient-to-br from-yellow-500/10 to-amber-500/5 hover:from-yellow-500/15 hover:to-amber-500/10 text-yellow-200 ring-1 ring-yellow-500/20',
    highlight: true,
  },
  {
    id: '50-fotos',
    photos: 50,
    price: 30.0,
    label: '50 fotos',
    badge: 'Ahorra S/20!',
    emoji: '🔥',
    style: 'border-red-500/40 bg-gradient-to-br from-red-500/10 to-orange-500/5 hover:from-red-500/15 hover:to-orange-500/10 text-red-200 ring-1 ring-red-500/20 text-base',
    highlight: true,
  },
];

export default function BuyImagesModal({
  isOpen,
  onClose,
  yapeNumber = 'Yape: Fabio Herrera',
  onPaymentConfirmed,
}: BuyImagesModalProps) {
  const [selectedPack, setSelectedPack] = useState<typeof IMAGE_PACKAGES[0] | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleSelectPack = (pack: typeof IMAGE_PACKAGES[0]) => {
    setSelectedPack(pack);
  };

  const handleConfirmPayment = async () => {
    if (!selectedPack) return;
    setConfirming(true);

    // Simulate a brief delay for UX
    await new Promise((r) => setTimeout(r, 500));

    onPaymentConfirmed(selectedPack.photos, selectedPack.price);
    setConfirming(false);
  };

  const handleClose = () => {
    setSelectedPack(null);
    setConfirming(false);
    onClose();
  };

  const WHATSAPP_NUMBER = '51933667414';

  const openWhatsApp = () => {
    if (!selectedPack) return;
    const msg = encodeURIComponent(
      `Hola Atlas! Acabo de pagar S/ ${selectedPack.price.toFixed(2)} por ${selectedPack.photos} fotos extra. Adjunto mi comprobante para la activacion.`
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[90]"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-4 top-[5%] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-[400px] bg-gray-900 rounded-2xl shadow-2xl border border-gray-700/40 z-[95] overflow-y-auto overscroll-contain max-h-[90vh] sm:max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-0">
              <div>
                <h2 className="text-lg font-bold text-white">Comprar imagenes extra</h2>
                <p className="text-xs text-gray-500 mt-0.5">Selecciona un paquete</p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl hover:bg-gray-800/60 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {/* Info paragraph */}
              <p className="text-sm text-gray-400 leading-relaxed">
                Te has quedado sin cuota de imagenes este mes. Compra un paquete extra:
              </p>

              {/* Package buttons */}
              {IMAGE_PACKAGES.map((pack) => (
                <motion.button
                  key={pack.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelectPack(pack)}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between ${pack.style} ${
                    selectedPack?.id === pack.id ? 'ring-2 ring-emerald-400/50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${pack.highlight ? 'text-lg' : 'text-sm'}`}>
                      {pack.label}
                    </span>
                    {pack.badge && (
                      <span className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full">
                        {pack.badge}
                      </span>
                    )}
                    {pack.emoji && (
                      <span className="text-lg">{pack.emoji}</span>
                    )}
                  </div>
                  <span className={`font-bold ${pack.highlight ? 'text-xl' : 'text-base'}`}>
                    S/ {pack.price.toFixed(2)}
                  </span>
                </motion.button>
              ))}

              {/* Payment instructions — shown when a pack is selected */}
              <AnimatePresence>
                {selectedPack && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/30 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-purple-500/15 flex items-center justify-center shrink-0">
                          <Sparkles className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">
                            Realiza el Yape a:
                          </p>
                          <p className="text-xs text-gray-400">{yapeNumber}</p>
                        </div>
                      </div>

                      <div className="text-center bg-yellow-500/10 rounded-lg p-2.5 border border-yellow-500/20">
                        <p className="text-xs text-gray-400">Monto a pagar:</p>
                        <p className="text-2xl font-black text-yellow-400">
                          S/ {selectedPack.price.toFixed(2)}
                        </p>
                        <p className="text-[10px] text-gray-500">Por {selectedPack.photos} fotos</p>
                      </div>

                      <button
                        onClick={handleConfirmPayment}
                        disabled={confirming}
                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700/50 text-white font-semibold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                      >
                        {confirming ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        {confirming ? 'Procesando...' : 'Ya realice el Yape'}
                      </button>

                      <button
                        onClick={openWhatsApp}
                        className="w-full py-2.5 rounded-xl bg-gray-800/60 border border-gray-700/30 text-xs text-gray-300 hover:text-white hover:bg-gray-800 transition-all flex items-center justify-center gap-1.5"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        Enviar comprobante por WhatsApp
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
